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

import type { EnvConfig } from '../../config/env.config';
import { AIErrors } from '../ai/domain/errors/ai.errors';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { RunAgentTurnHandler } from './application/run-agent-turn.handler';

const agentMessagePayloadSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(20000),
      })
    )
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1]?.role === 'user', {
      message: 'last message must be from the user',
    }),
  noteId: z.string().uuid().optional(),
});

interface AuthenticatedAgentSocket extends Socket {
  data: { userId?: string; isAnonymous?: boolean };
}

@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AgentGateway.name);
  private readonly activeTurns = new Map<string, AbortController>();
  private readonly userTurnCount = new Map<string, number>();
  private readonly clientTurns = new Map<string, Set<string>>();
  private readonly maxConcurrentTurns: number;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly runAgentTurn: RunAgentTurnHandler,
    private readonly jwtService: JwtService,
    private readonly featureFlagsService: FeatureFlagsService,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.maxConcurrentTurns = configService.get('AI_MAX_CONCURRENT_STREAMS');
  }

  afterInit(): void {
    this.logger.log('Agent WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedAgentSocket): Promise<void> {
    const token =
      (client.handshake.auth?.['token'] as string | undefined) ??
      client.handshake.headers?.['authorization']?.replace('Bearer ', '');
    if (!token) {
      client.emit('agent:error', AIErrors.authRequired());
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
    } catch {
      client.emit('agent:error', AIErrors.authRequired('Invalid token'));
      client.disconnect();
      return;
    }

    if (!(await this.featureFlagsService.isEnabled('ai_enabled'))) {
      client.emit('agent:error', AIErrors.featureDisabled());
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedAgentSocket): void {
    this.abortClientTurns(client.id);
  }

  @SubscribeMessage('agent:message')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedAgentSocket,
    @MessageBody() payload: unknown
  ): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    const parsed = agentMessagePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      client.emit(
        'agent:error',
        AIErrors.validationError(
          parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        )
      );
      return;
    }

    if ((this.userTurnCount.get(userId) ?? 0) >= this.maxConcurrentTurns) {
      client.emit(
        'agent:error',
        AIErrors.rateLimitExceeded(
          `Maximum ${this.maxConcurrentTurns} concurrent agent turns allowed.`
        )
      );
      return;
    }

    const turnId = randomUUID();
    const controller = new AbortController();
    this.acquireTurnSlot(userId, client.id, turnId, controller);

    try {
      await this.runAgentTurn.execute(
        {
          userId,
          messages: parsed.data.messages,
          ...(client.data.isAnonymous && { isAnonymous: true }),
          ...(parsed.data.noteId && { noteId: parsed.data.noteId }),
        },
        {
          onChunk: (text) => client.emit('agent:chunk', { text }),
          onDone: (usage) =>
            client.emit('agent:done', {
              usage: {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                model: usage.model,
                costUsd: usage.costUsd,
              },
              sources: usage.sources,
            }),
          onError: (error) => {
            if (!controller.signal.aborted) {
              client.emit('agent:error', error);
            }
          },
        },
        controller.signal
      );
    } finally {
      this.releaseTurnSlot(userId, client.id, turnId);
    }
  }

  @SubscribeMessage('agent:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedAgentSocket): void {
    this.abortClientTurns(client.id);
    this.logger.debug(`Client ${client.id} cancelled agent turn(s)`);
  }

  private acquireTurnSlot(
    userId: string,
    clientId: string,
    turnId: string,
    controller: AbortController
  ): void {
    this.activeTurns.set(turnId, controller);
    this.userTurnCount.set(userId, (this.userTurnCount.get(userId) ?? 0) + 1);
    const clientSet = this.clientTurns.get(clientId) ?? new Set();
    clientSet.add(turnId);
    this.clientTurns.set(clientId, clientSet);
  }

  private releaseTurnSlot(
    userId: string,
    clientId: string,
    turnId: string
  ): void {
    this.activeTurns.delete(turnId);
    const clientSet = this.clientTurns.get(clientId);
    if (clientSet) {
      clientSet.delete(turnId);
      if (clientSet.size === 0) {
        this.clientTurns.delete(clientId);
      }
    }
    const count = this.userTurnCount.get(userId) ?? 0;
    if (count <= 1) {
      this.userTurnCount.delete(userId);
    } else {
      this.userTurnCount.set(userId, count - 1);
    }
  }

  private abortClientTurns(clientId: string): void {
    const turnIds = this.clientTurns.get(clientId);
    if (!turnIds) {
      return;
    }
    for (const turnId of turnIds) {
      this.activeTurns.get(turnId)?.abort();
    }
  }
}
