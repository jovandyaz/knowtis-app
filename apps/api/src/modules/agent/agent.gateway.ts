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
});

interface AuthenticatedAgentSocket extends Socket {
  data: { userId?: string; isAnonymous?: boolean };
}

@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(AgentGateway.name);
  private readonly activeTurns = new Map<string, AbortController>();
  private readonly userTurnCount = new Map<string, number>();
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
    const aiEnabled = await this.featureFlagsService.isEnabled('ai_enabled');
    if (!aiEnabled) {
      client.emit('agent:error', AIErrors.featureDisabled());
      client.disconnect();
      return;
    }
    const token =
      (client.handshake.auth?.['token'] as string | undefined) ??
      client.handshake.headers?.['authorization']?.replace('Bearer ', '');
    if (!token) {
      client.emit('agent:error', AIErrors.authRequired());
      client.disconnect();
      return;
    }
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
    }
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

    const current = this.userTurnCount.get(userId) ?? 0;
    if (current >= this.maxConcurrentTurns) {
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
    this.activeTurns.set(turnId, controller);
    this.userTurnCount.set(userId, current + 1);

    try {
      await this.runAgentTurn.execute(
        {
          userId,
          messages: parsed.data.messages,
          ...(client.data.isAnonymous && { isAnonymous: true }),
        },
        {
          onChunk: (text) => client.emit('agent:chunk', { text }),
          onDone: (usage) => client.emit('agent:done', { usage }),
          onError: (error) => {
            if (!controller.signal.aborted) {
              client.emit('agent:error', error);
            }
          },
        },
        controller.signal
      );
    } finally {
      this.activeTurns.delete(turnId);
      const count = this.userTurnCount.get(userId) ?? 0;
      if (count <= 1) {
        this.userTurnCount.delete(userId);
      } else {
        this.userTurnCount.set(userId, count - 1);
      }
    }
  }

  @SubscribeMessage('agent:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedAgentSocket): void {
    for (const [, controller] of this.activeTurns) {
      controller.abort();
    }
    this.logger.debug(`Client ${client.id} cancelled agent turn(s)`);
  }
}
