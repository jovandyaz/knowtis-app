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
import { ApproveMutationHandler } from './application/approve-mutation.handler';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import {
  RunAgentTurnHandler,
  type RunAgentTurnCallbacks,
} from './application/run-agent-turn.handler';

const knownNotesSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      title: z.string().max(500),
    })
  )
  .max(100)
  .optional();

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
  knownNotes: knownNotesSchema,
});

const agentApprovePayloadSchema = z.object({
  proposalId: z.string().uuid(),
  messages: agentMessagePayloadSchema.shape.messages,
  noteId: z.string().uuid().optional(),
  knownNotes: knownNotesSchema,
});

const agentRejectPayloadSchema = agentApprovePayloadSchema.extend({
  reason: z.string().max(1000).optional(),
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
    private readonly approveMutation: ApproveMutationHandler,
    private readonly rejectMutation: RejectMutationHandler,
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

    await this.runInTurnSlot(client, userId, (controller) =>
      this.runAgentTurn.execute(
        {
          userId,
          messages: parsed.data.messages,
          ...(client.data.isAnonymous && { isAnonymous: true }),
          ...(parsed.data.noteId && { noteId: parsed.data.noteId }),
          ...(parsed.data.knownNotes && {
            knownNotes: parsed.data.knownNotes,
          }),
        },
        {
          ...this.baseCallbacks(client, controller),
          onProposal: (proposal) =>
            client.emit('agent:proposal', {
              id: proposal.id,
              kind: proposal.kind,
              targetNoteId: proposal.targetNoteId ?? null,
              summary: proposal.summary,
              previewHtml: proposal.previewHtml ?? null,
              payload: proposal.payload,
            }),
        },
        controller.signal
      )
    );
  }

  @SubscribeMessage('agent:cancel')
  handleCancel(@ConnectedSocket() client: AuthenticatedAgentSocket): void {
    this.abortClientTurns(client.id);
    this.logger.debug(`Client ${client.id} cancelled agent turn(s)`);
  }

  @SubscribeMessage('agent:approve')
  async handleApprove(
    @ConnectedSocket() client: AuthenticatedAgentSocket,
    @MessageBody() payload: unknown
  ): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    const parsed = agentApprovePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      client.emit(
        'agent:error',
        AIErrors.validationError('invalid approve payload')
      );
      return;
    }
    const res = await this.approveMutation.execute({
      proposalId: parsed.data.proposalId,
      userId,
    });
    if (res.isErr()) {
      client.emit('agent:error', {
        code: res.error.code,
        message: res.error.message,
      });
      return;
    }
    client.emit('agent:committed', {
      proposalId: parsed.data.proposalId,
      result: res.value.result,
    });
    await this.resumeAfter(client, userId, parsed.data, res.value);
  }

  @SubscribeMessage('agent:reject')
  async handleReject(
    @ConnectedSocket() client: AuthenticatedAgentSocket,
    @MessageBody() payload: unknown
  ): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    const parsed = agentRejectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      client.emit(
        'agent:error',
        AIErrors.validationError('invalid reject payload')
      );
      return;
    }
    const res = await this.rejectMutation.execute({
      proposalId: parsed.data.proposalId,
      userId,
      ...(parsed.data.reason && { reason: parsed.data.reason }),
    });
    if (res.isErr()) {
      client.emit('agent:error', {
        code: res.error.code,
        message: res.error.message,
      });
      return;
    }
    await this.resumeAfter(client, userId, parsed.data, res.value);
  }

  private async resumeAfter(
    client: AuthenticatedAgentSocket,
    userId: string,
    data: {
      messages: { role: 'user' | 'assistant'; content: string }[];
      noteId?: string | undefined;
      knownNotes?: { id: string; title: string }[] | undefined;
    },
    outcome: { toolName: string; outcome: string }
  ): Promise<void> {
    if ((this.userTurnCount.get(userId) ?? 0) >= this.maxConcurrentTurns) {
      client.emit(
        'agent:error',
        AIErrors.rateLimitExceeded(
          `Maximum ${this.maxConcurrentTurns} concurrent agent turns allowed.`
        )
      );
      return;
    }
    await this.runInTurnSlot(client, userId, (controller) =>
      this.runAgentTurn.resumeTurn(
        {
          userId,
          messages: data.messages,
          ...(data.noteId && { noteId: data.noteId }),
          ...(data.knownNotes && { knownNotes: data.knownNotes }),
          resume: outcome,
        },
        this.baseCallbacks(client, controller),
        controller.signal
      )
    );
  }

  private async runInTurnSlot(
    client: AuthenticatedAgentSocket,
    userId: string,
    body: (controller: AbortController) => Promise<void>
  ): Promise<void> {
    const turnId = randomUUID();
    const controller = new AbortController();
    this.acquireTurnSlot(userId, client.id, turnId, controller);
    try {
      await body(controller);
    } finally {
      this.releaseTurnSlot(userId, client.id, turnId);
    }
  }

  private baseCallbacks(
    client: AuthenticatedAgentSocket,
    controller: AbortController
  ): Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'> {
    return {
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
          knownNotes: usage.knownNotes,
        }),
      onError: (error) => {
        if (!controller.signal.aborted) {
          client.emit('agent:error', error);
        }
      },
    };
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
