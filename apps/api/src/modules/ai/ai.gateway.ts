import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

import { AI_LANGUAGES, AI_TONES } from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { StreamTextHandler } from './application/commands/stream-text.handler';
import { AIErrors } from './domain/errors/ai.errors';
import { SUPPORTED_AI_ACTIONS } from './domain/value-objects/ai-action.vo';

const aiCompletePayloadSchema = z.object({
  action: z.enum(SUPPORTED_AI_ACTIONS),
  content: z.string().min(1).max(50000),
  selection: z.string().max(10000).optional(),
  suffix: z.string().max(10000).optional(),
  targetLanguage: z.enum(AI_LANGUAGES).optional(),
  targetTone: z.enum(AI_TONES).optional(),
});

interface AuthenticatedAISocket extends Socket {
  data: {
    userId?: string;
    isAnonymous?: boolean;
  };
}

@WebSocketGateway({ namespace: '/ai' })
export class AIGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AIGateway.name);
  // NOTE: In-memory tracking — enforced per-instance only.
  // If horizontally scaled, move to Redis (e.g. ai:streams:{userId} sorted set).
  private readonly activeStreams = new Map<string, AbortController>();
  private readonly userStreamCount = new Map<string, number>();
  private readonly clientStreams = new Map<string, Set<string>>();
  private readonly maxConcurrentStreams: number;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly streamTextHandler: StreamTextHandler,
    private readonly jwtService: JwtService,
    private readonly featureFlagsService: FeatureFlagsService,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.maxConcurrentStreams = configService.get('AI_MAX_CONCURRENT_STREAMS');
  }

  afterInit(): void {
    this.logger.log('AI WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedAISocket): Promise<void> {
    const token =
      (client.handshake.auth?.['token'] as string | undefined) ??
      client.handshake.headers?.['authorization']?.replace('Bearer ', '');

    if (!token) {
      client.emit('ai:error', AIErrors.authRequired());
      client.disconnect();
      return;
    }

    // Verify + set userId synchronously BEFORE the async flag check below, so a
    // message emitted on the same tick as `connect` can't race ahead of it.
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        isAnonymous?: boolean;
      }>(token);
      client.data.userId = payload.sub;
      if (payload.isAnonymous) {
        client.data.isAnonymous = true;
      }
      this.logger.log({
        event: 'ai.client.connected',
        clientId: client.id,
        userId: payload.sub,
      });
    } catch {
      this.logger.warn({
        event: 'ai.client.auth_failed',
        clientId: client.id,
      });
      client.emit(
        'ai:error',
        AIErrors.authRequired('Invalid authentication token')
      );
      client.disconnect();
      return;
    }

    if (!(await this.featureFlagsService.isEnabled('ai_enabled'))) {
      client.emit('ai:error', AIErrors.featureDisabled());
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedAISocket): void {
    const hadActiveStreams = (this.clientStreams.get(client.id)?.size ?? 0) > 0;
    this.abortClientStreams(client.id);

    this.logger.log({
      event: 'ai.client.disconnected',
      clientId: client.id,
      userId: client.data?.userId,
      hadActiveStreams,
    });
  }

  @SubscribeMessage('ai:complete')
  async handleComplete(
    @ConnectedSocket() client: AuthenticatedAISocket,
    @MessageBody() payload: unknown
  ): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('ai:error', AIErrors.authRequired());
      return;
    }

    const parsed = aiCompletePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      client.emit(
        'ai:error',
        AIErrors.validationError(
          parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        )
      );
      return;
    }

    const { action, content, selection, suffix, targetLanguage, targetTone } =
      parsed.data;

    const currentCount = this.userStreamCount.get(userId) ?? 0;
    if (currentCount >= this.maxConcurrentStreams) {
      client.emit(
        'ai:error',
        AIErrors.rateLimitExceeded(
          `Maximum ${this.maxConcurrentStreams} concurrent AI requests allowed.`
        )
      );
      return;
    }

    const streamId = randomUUID();
    this.acquireStreamSlot(userId, client.id, streamId);

    const controller = new AbortController();
    this.activeStreams.set(streamId, controller);

    try {
      await this.streamTextHandler.execute(
        {
          userId,
          action,
          content,
          ...(selection !== undefined && { selection }),
          ...(suffix !== undefined && { suffix }),
          ...(targetLanguage !== undefined && { targetLanguage }),
          ...(targetTone !== undefined && { targetTone }),
          ...(client.data.isAnonymous && { isAnonymous: true }),
        },
        {
          onChunk: (text) => client.emit('ai:chunk', { text }),
          onDone: (usage) => client.emit('ai:done', { usage }),
          onError: (error) => {
            if (!controller.signal.aborted) {
              client.emit('ai:error', error);
            }
          },
        },
        controller.signal
      );
    } catch (error) {
      this.logger.error({
        event: 'ai.stream.unexpected_error',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      if (!controller.signal.aborted) {
        client.emit(
          'ai:error',
          AIErrors.providerError(
            error instanceof Error ? error.message : 'AI streaming failed'
          )
        );
      }
    } finally {
      this.releaseStreamSlot(userId, client.id, streamId);
    }
  }

  @SubscribeMessage('ai:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedAISocket): void {
    this.abortClientStreams(client.id);
    this.logger.debug(`Client ${client.id} cancelled AI stream(s)`);
  }

  private acquireStreamSlot(
    userId: string,
    clientId: string,
    streamId: string
  ): void {
    this.userStreamCount.set(
      userId,
      (this.userStreamCount.get(userId) ?? 0) + 1
    );
    const clientSet = this.clientStreams.get(clientId) ?? new Set();
    clientSet.add(streamId);
    this.clientStreams.set(clientId, clientSet);
  }

  private releaseStreamSlot(
    userId: string,
    clientId: string,
    streamId: string
  ): void {
    if (!this.activeStreams.delete(streamId)) {
      return;
    }

    const clientSet = this.clientStreams.get(clientId);
    if (clientSet) {
      clientSet.delete(streamId);
      if (clientSet.size === 0) {
        this.clientStreams.delete(clientId);
      }
    }

    const count = this.userStreamCount.get(userId) ?? 0;
    if (count <= 1) {
      this.userStreamCount.delete(userId);
    } else {
      this.userStreamCount.set(userId, count - 1);
    }
  }

  private abortClientStreams(clientId: string): void {
    const streamIds = this.clientStreams.get(clientId);
    if (!streamIds) {
      return;
    }
    for (const streamId of streamIds) {
      this.activeStreams.get(streamId)?.abort();
    }
  }
}
