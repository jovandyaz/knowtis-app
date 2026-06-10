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
import type { Server } from 'socket.io';
import { z } from 'zod';

import { AI_LANGUAGES, AI_TONES } from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ConcurrencySlotTracker } from '../websocket/concurrency-slot-tracker';
import {
  authenticateSocket,
  socketAuthFailureMessage,
  type AuthenticatedSocket,
} from '../websocket/socket-auth';
import { SocketExpiryTimers } from '../websocket/socket-expiry';
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

@WebSocketGateway({ namespace: '/ai' })
export class AIGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AIGateway.name);
  private readonly streams: ConcurrencySlotTracker;
  private readonly expiryTimers = new SocketExpiryTimers();
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
    this.streams = new ConcurrencySlotTracker(this.maxConcurrentStreams);
  }

  afterInit(): void {
    this.logger.log('AI WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const auth = authenticateSocket(client, this.jwtService, this.logger, 'ai');
    if (!auth.ok) {
      client.emit(
        'ai:error',
        AIErrors.authRequired(socketAuthFailureMessage(auth.reason))
      );
      client.disconnect();
      return;
    }

    if (!(await this.featureFlagsService.isEnabled('ai_enabled'))) {
      client.emit('ai:error', AIErrors.featureDisabled());
      client.disconnect();
      return;
    }

    if (client.connected && auth.tokenExpiresAtMs !== undefined) {
      this.expiryTimers.arm(client.id, auth.tokenExpiresAtMs, () => {
        client.emit('ai:error', AIErrors.authRequired('Token expired'));
        client.disconnect(true);
      });
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.expiryTimers.clear(client.id);
    const hadActiveStreams = this.streams.hasActiveSlots(client.id);
    this.streams.abortAllForClient(client.id);

    this.logger.log({
      event: 'ai.client.disconnected',
      clientId: client.id,
      userId: client.data?.userId,
      hadActiveStreams,
    });
  }

  @SubscribeMessage('ai:complete')
  async handleComplete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown
  ): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('ai:error', AIErrors.authRequired());
      return;
    }

    if (!(await this.featureFlagsService.isEnabled('ai_enabled'))) {
      client.emit('ai:error', AIErrors.featureDisabled());
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

    const streamId = randomUUID();
    const controller = new AbortController();
    if (!this.streams.acquire(userId, client.id, streamId, controller)) {
      client.emit(
        'ai:error',
        AIErrors.rateLimitExceeded(
          `Maximum ${this.maxConcurrentStreams} concurrent AI requests allowed.`
        )
      );
      return;
    }

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
      this.streams.release(userId, client.id, streamId);
    }
  }

  @SubscribeMessage('ai:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedSocket): void {
    this.streams.abortAllForClient(client.id);
    this.logger.debug(`Client ${client.id} cancelled AI stream(s)`);
  }
}
