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
import { StreamTextHandler } from './application/commands/stream-text.handler';
import { SUPPORTED_LANGUAGES } from './domain/constants/supported-languages';
import { SUPPORTED_TONES } from './domain/constants/supported-tones';
import { AIErrors } from './domain/errors/ai.errors';
import { SUPPORTED_AI_ACTIONS } from './domain/value-objects/ai-action.vo';

const aiCompletePayloadSchema = z.object({
  action: z.enum(SUPPORTED_AI_ACTIONS),
  content: z.string().min(1).max(50000),
  selection: z.string().max(10000).optional(),
  targetLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  targetTone: z.enum(SUPPORTED_TONES).optional(),
});

interface AuthenticatedAISocket extends Socket {
  data: {
    userId?: string;
  };
}

@WebSocketGateway({
  namespace: '/ai',
  cors: {
    origin: process.env['FRONTEND_URL'] || 'http://localhost:4200',
    credentials: true,
  },
})
export class AIGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AIGateway.name);
  private readonly activeStreams = new Map<string, AbortController>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly streamTextHandler: StreamTextHandler,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  afterInit(): void {
    this.logger.log('AI WebSocket Gateway initialized');
  }

  handleConnection(client: AuthenticatedAISocket): void {
    if (!this.isAIEnabled()) {
      client.emit('ai:error', AIErrors.featureDisabled());
      client.disconnect();
      return;
    }

    const token =
      (client.handshake.auth?.['token'] as string | undefined) ??
      client.handshake.headers?.['authorization']?.replace('Bearer ', '');

    if (!token) {
      client.emit('ai:error', AIErrors.authRequired());
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      client.data.userId = payload.sub;
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
    }
  }

  handleDisconnect(client: AuthenticatedAISocket): void {
    const hadActiveStream = this.activeStreams.has(client.id);
    this.abortClientStream(client.id);
    this.logger.log({
      event: 'ai.client.disconnected',
      clientId: client.id,
      userId: client.data?.userId,
      hadActiveStream,
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

    const { action, content, selection, targetLanguage, targetTone } =
      parsed.data;

    const controller = new AbortController();
    this.activeStreams.set(client.id, controller);

    await this.streamTextHandler.execute(
      {
        userId,
        action,
        content,
        ...(selection !== undefined && { selection }),
        ...(targetLanguage !== undefined && { targetLanguage }),
        ...(targetTone !== undefined && { targetTone }),
      },
      {
        onChunk: (text) => client.emit('ai:chunk', { text }),
        onDone: (usage) => {
          this.activeStreams.delete(client.id);
          client.emit('ai:done', { usage });
        },
        onError: (error) => {
          this.activeStreams.delete(client.id);
          client.emit('ai:error', error);
        },
      },
      controller.signal
    );
  }

  @SubscribeMessage('ai:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedAISocket): void {
    this.abortClientStream(client.id);
    this.logger.debug(`Client ${client.id} cancelled AI stream`);
  }

  private isAIEnabled(): boolean {
    return this.configService.get('AI_ENABLED') === 'true';
  }

  private abortClientStream(clientId: string): void {
    const controller = this.activeStreams.get(clientId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(clientId);
    }
  }
}
