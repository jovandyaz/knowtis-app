import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  Ack,
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

import { MODEL_ID_MAX_LENGTH, REASONING_EFFORTS } from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { AIErrors } from '../ai/domain/errors/ai.errors';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ConcurrencySlotTracker } from '../websocket/concurrency-slot-tracker';
import {
  authenticateSocket,
  socketAuthFailureMessage,
  type AuthenticatedSocket,
} from '../websocket/socket-auth';
import { SocketExpiryTimers } from '../websocket/socket-expiry';
import { ApproveMutationHandler } from './application/approve-mutation.handler';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import {
  RunAgentTurnHandler,
  type RunAgentTurnCallbacks,
} from './application/run-agent-turn.handler';
import { AgentErrors } from './domain/agent-errors';
import { conversationIdForTurn } from './domain/turn-identity';
import {
  TURN_CLAIM_OUTCOME,
  TurnClaimService,
  type TurnClaimOutcome,
  type TurnClaimRequest,
} from './infrastructure/turn-claim/turn-claim.service';

/** Delivery receipt: socket.io delivers at most once, so the client fails a
 * request whose receipt never arrives instead of resending it. Every handler
 * acknowledges on receipt, before validation; outcomes still travel as
 * `agent:error`. */
type DeliveryAck = () => void;

const agentTurnSchema = z.object({
  turnId: z.uuid().optional(),
  conversationId: z.string().uuid().optional(),
  message: z.object({ content: z.string().min(1).max(20000) }),
  noteId: z.string().uuid().optional(),
  model: z.string().trim().min(1).max(MODEL_ID_MAX_LENGTH).optional(),
  effort: z.enum(REASONING_EFFORTS).optional(),
});

const agentApprovePayloadSchema = z.object({
  proposalId: z.string().uuid(),
  noteId: z.string().uuid().optional(),
});

const agentRejectPayloadSchema = agentApprovePayloadSchema.extend({
  reason: z.string().max(1000).optional(),
});

/** The legs of a turn hold separate slots: a resume can start while the leg that proposed is still settling its claim. */
const TURN_LEG = { MESSAGE: 'message', RESUME: 'resume' } as const;

type TurnLeg = (typeof TURN_LEG)[keyof typeof TURN_LEG];

@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AgentGateway.name);
  private readonly turns: ConcurrencySlotTracker;
  private readonly expiryTimers = new SocketExpiryTimers();
  private readonly maxConcurrentTurns: number;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly runAgentTurn: RunAgentTurnHandler,
    private readonly approveMutation: ApproveMutationHandler,
    private readonly rejectMutation: RejectMutationHandler,
    private readonly turnClaims: TurnClaimService,
    private readonly jwtService: JwtService,
    private readonly featureFlagsService: FeatureFlagsService,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.maxConcurrentTurns = configService.get('AI_MAX_CONCURRENT_STREAMS');
    this.turns = new ConcurrencySlotTracker(this.maxConcurrentTurns);
  }

  afterInit(): void {
    this.logger.log('Agent WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const auth = authenticateSocket(
      client,
      this.jwtService,
      this.logger,
      'agent'
    );
    if (!auth.ok) {
      client.emit(
        'agent:error',
        AIErrors.authRequired(socketAuthFailureMessage(auth.reason))
      );
      client.disconnect();
      return;
    }

    if (!(await this.featureFlagsService.isEnabled('ai_enabled'))) {
      client.emit('agent:error', AIErrors.featureDisabled());
      client.disconnect();
      return;
    }

    if (client.connected && auth.tokenExpiresAtMs !== undefined) {
      this.expiryTimers.arm(client.id, auth.tokenExpiresAtMs, () => {
        client.emit('agent:error', AIErrors.authRequired('Token expired'));
        client.disconnect(true);
      });
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.expiryTimers.clear(client.id);
    const hadActiveTurns = this.turns.hasActiveSlots(client.id);
    this.turns.abortAllForClient(client.id);
    this.logger.log({
      event: 'agent.client.disconnected',
      clientId: client.id,
      userId: client.data?.userId,
      hadActiveTurns,
    });
  }

  @SubscribeMessage('agent:message')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: DeliveryAck
  ): Promise<void> {
    ack?.();
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    if (!(await this.ensureAiEnabled(client))) {
      return;
    }
    const parsed = agentTurnSchema.safeParse(payload);
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

    const data = parsed.data;
    const turnId = data.turnId ?? randomUUID();
    const claim: TurnClaimRequest | undefined = data.turnId
      ? {
          userId,
          turnId,
          conversationId:
            data.conversationId ?? conversationIdForTurn(userId, turnId),
          noteId: data.noteId,
          content: data.message.content,
        }
      : undefined;
    const onProposal: RunAgentTurnCallbacks['onProposal'] = (proposal) =>
      client.emit('agent:proposal', {
        turnId,
        id: proposal.id,
        kind: proposal.kind,
        targetNoteId: proposal.kind === 'create' ? null : proposal.targetNoteId,
        summary: proposal.summary,
        payload: proposal.payload,
      });

    await this.runInTurnSlot(
      client,
      userId,
      turnId,
      TURN_LEG.MESSAGE,
      (controller) =>
        this.withTurnClaim(client, claim, (onModelStart) =>
          this.runAgentTurn.execute(
            {
              userId,
              turnId,
              message: { content: data.message.content },
              ...(data.conversationId && {
                conversationId: data.conversationId,
              }),
              ...(client.data.isAnonymous && { isAnonymous: true }),
              ...(client.data.clientIp
                ? { clientIp: client.data.clientIp }
                : {}),
              ...(data.noteId && { noteId: data.noteId }),
              ...(data.model && { model: data.model }),
              ...(data.effort && { effort: data.effort }),
            },
            {
              ...this.baseCallbacks(client, controller, turnId),
              onProposal,
              onModelStart,
            },
            controller.signal
          )
        )
    );
  }

  @SubscribeMessage('agent:cancel')
  handleCancel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @Ack() ack?: DeliveryAck
  ): void {
    ack?.();
    this.turns.abortAllForClient(client.id);
    this.logger.debug(`Client ${client.id} cancelled agent turn(s)`);
  }

  @SubscribeMessage('agent:approve')
  async handleApprove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: DeliveryAck
  ): Promise<void> {
    ack?.();
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    if (!(await this.ensureAiEnabled(client))) {
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
        ...(res.error.turnId ? { turnId: res.error.turnId } : {}),
      });
      return;
    }
    client.emit('agent:committed', {
      turnId: res.value.turnId,
      proposalId: parsed.data.proposalId,
      result: res.value.result,
    });
    await this.resumeAfter(client, userId, parsed.data, res.value);
  }

  @SubscribeMessage('agent:reject')
  async handleReject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: DeliveryAck
  ): Promise<void> {
    ack?.();
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    if (!(await this.ensureAiEnabled(client))) {
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

  private async ensureAiEnabled(client: AuthenticatedSocket): Promise<boolean> {
    if (await this.featureFlagsService.isEnabled('ai_enabled')) {
      return true;
    }
    client.emit('agent:error', AIErrors.featureDisabled());
    return false;
  }

  private async resumeAfter(
    client: AuthenticatedSocket,
    userId: string,
    data: { noteId?: string | undefined },
    result: { outcome: string; turnId: string; conversationId: string }
  ): Promise<void> {
    await this.runInTurnSlot(
      client,
      userId,
      result.turnId,
      TURN_LEG.RESUME,
      (controller) =>
        this.runAgentTurn.resumeTurn(
          {
            userId,
            turnId: result.turnId,
            conversationId: result.conversationId,
            ...(client.data.isAnonymous && { isAnonymous: true }),
            ...(client.data.clientIp ? { clientIp: client.data.clientIp } : {}),
            ...(data.noteId && { noteId: data.noteId }),
            resume: { outcome: result.outcome },
          },
          this.baseCallbacks(client, controller, result.turnId),
          controller.signal
        )
    );
  }

  // Stripe's rule: a turn refused before the model ran saves nothing, so its
  // claim is released and a resend of it runs.
  private async withTurnClaim(
    client: AuthenticatedSocket,
    claim: TurnClaimRequest | undefined,
    turn: (onModelStart: () => void) => Promise<void>
  ): Promise<void> {
    if (!claim) {
      return turn(() => undefined);
    }
    const outcome = await this.turnClaims.claim(claim);
    if (outcome !== TURN_CLAIM_OUTCOME.CLAIMED) {
      this.refuseClaimedTurn(client, claim, outcome);
      return;
    }
    let modelStarted = false;
    try {
      await turn(() => {
        modelStarted = true;
      });
    } finally {
      await (modelStarted
        ? this.turnClaims.settle(claim)
        : this.turnClaims.release(claim));
    }
  }

  private refuseClaimedTurn(
    client: AuthenticatedSocket,
    { turnId, conversationId }: TurnClaimRequest,
    outcome: Exclude<TurnClaimOutcome, typeof TURN_CLAIM_OUTCOME.CLAIMED>
  ): void {
    switch (outcome) {
      case TURN_CLAIM_OUTCOME.SETTLED:
        client.emit('agent:turn_settled', { turnId, conversationId });
        return;
      case TURN_CLAIM_OUTCOME.RUNNING:
        client.emit('agent:error', {
          ...AgentErrors.turnInProgress(),
          turnId,
        });
        return;
      case TURN_CLAIM_OUTCOME.REUSED:
        client.emit('agent:error', { ...AgentErrors.turnIdReused(), turnId });
        return;
      case TURN_CLAIM_OUTCOME.UNAVAILABLE:
        client.emit('agent:error', {
          ...AgentErrors.turnClaimUnavailable(),
          turnId,
        });
        return;
      default: {
        const _exhaustive: never = outcome;
        throw new Error(`Unhandled turn claim outcome: ${String(_exhaustive)}`);
      }
    }
  }

  private async runInTurnSlot(
    client: AuthenticatedSocket,
    userId: string,
    turnId: string,
    leg: TurnLeg,
    body: (controller: AbortController) => Promise<void>
  ): Promise<void> {
    // A disconnect or cancel handled during an earlier await found no slot to
    // abort, so a turn started now would run to completion for nobody.
    if (!client.connected) {
      this.logger.debug({
        event: 'agent.turn.skipped_disconnected',
        clientId: client.id,
        userId,
      });
      return;
    }
    const slotId = `${userId}:${turnId}:${leg}`;
    if (this.turns.isActive(slotId)) {
      client.emit('agent:error', { ...AgentErrors.turnInProgress(), turnId });
      return;
    }
    const controller = new AbortController();
    if (!this.turns.acquire(userId, client.id, slotId, controller)) {
      client.emit('agent:error', {
        ...AIErrors.rateLimitExceeded(
          `Maximum ${this.maxConcurrentTurns} concurrent agent turns allowed.`
        ),
        turnId,
      });
      return;
    }
    try {
      await body(controller);
    } finally {
      this.turns.release(userId, client.id, slotId);
    }
  }

  private baseCallbacks(
    client: AuthenticatedSocket,
    controller: AbortController,
    turnId: string
  ): Pick<
    RunAgentTurnCallbacks,
    'onChunk' | 'onDone' | 'onError' | 'onThinking' | 'onConversation'
  > {
    return {
      onChunk: (text) => client.emit('agent:chunk', { turnId, text }),
      onThinking: (text) => client.emit('agent:thinking', { turnId, text }),
      onConversation: (conversationId) =>
        client.emit('agent:conversation', { turnId, conversationId }),
      onDone: (usage) =>
        client.emit('agent:done', {
          turnId,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            model: usage.model,
            costUsd: usage.costUsd,
          },
          sources: usage.sources,
          knownNotes: usage.knownNotes,
          webSources: usage.webSources,
          stopReason: usage.stopReason,
          ...(usage.conversationId
            ? { conversationId: usage.conversationId }
            : {}),
        }),
      onError: (error) => {
        if (!controller.signal.aborted) {
          client.emit('agent:error', { ...error, turnId });
        }
      },
    };
  }
}
