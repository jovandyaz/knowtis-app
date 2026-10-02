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

import {
  FEATURE_FLAG_KEYS,
  MODEL_ID_MAX_LENGTH,
  REASONING_EFFORTS,
  type AgentQuotaPayload,
  type AiQuota,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { reasonOf } from '../../core/errors/reason-of';
import { AIErrors } from '../ai/domain/errors/ai.errors';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ConcurrencySlotTracker } from '../websocket/concurrency-slot-tracker';
import {
  SHUTDOWN_ABORT_REASON,
  ShutdownDrain,
} from '../websocket/shutdown-drain';
import {
  authenticateSocket,
  socketAuthFailureMessage,
  type AuthenticatedSocket,
} from '../websocket/socket-auth';
import { SocketTokenExpiry } from '../websocket/socket-expiry';
import { ApproveMutationHandler } from './application/approve-mutation.handler';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import {
  RunAgentTurnHandler,
  type RunAgentTurnCallbacks,
} from './application/run-agent-turn.handler';
import { AgentErrors } from './domain/agent-errors';
import { TURN_ABORT_REASON } from './domain/turn-abort';
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

const turnFields = {
  noteId: z.string().uuid().optional(),
  model: z.string().trim().min(1).max(MODEL_ID_MAX_LENGTH).optional(),
  effort: z.enum(REASONING_EFFORTS).optional(),
};

// Strict, so a continue request that also carries a message is refused
// instead of running as that message with continuesTurnId stripped.
const agentMessageSchema = z.strictObject({
  turnId: z.uuid().optional(),
  conversationId: z.string().uuid().optional(),
  message: z.object({ content: z.string().min(1).max(20000) }),
  ...turnFields,
});

const agentContinueSchema = z
  .strictObject({
    turnId: z.uuid(),
    conversationId: z.string().uuid(),
    continuesTurnId: z.uuid(),
    ...turnFields,
  })
  .refine((data) => data.continuesTurnId !== data.turnId, {
    error: 'must name an earlier turn',
    path: ['continuesTurnId'],
  });

const agentTurnSchema = z.union([agentMessageSchema, agentContinueSchema]);

type AgentTurnPayload = z.infer<typeof agentTurnSchema>;

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

interface UnexpectedFailure {
  readonly userId: string;
  readonly turnId?: string;
  readonly leg?: TurnLeg;
  readonly error: unknown;
}

function turnClaimOf(
  userId: string,
  turnId: string,
  data: AgentTurnPayload
): TurnClaimRequest | undefined {
  if (!data.turnId) {
    return undefined;
  }
  if ('continuesTurnId' in data) {
    return {
      userId,
      turnId,
      conversationId: data.conversationId,
      noteId: data.noteId,
      content: '',
      continuesTurnId: data.continuesTurnId,
    };
  }
  return {
    userId,
    turnId,
    conversationId:
      data.conversationId ?? conversationIdForTurn(userId, turnId),
    noteId: data.noteId,
    content: data.message.content,
  };
}

@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AgentGateway.name);
  private readonly turns: ConcurrencySlotTracker;
  private readonly tokenExpiry: SocketTokenExpiry;
  private readonly maxConcurrentTurns: number;
  private readonly endedLegs = new WeakSet<AbortController>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly runAgentTurn: RunAgentTurnHandler,
    private readonly approveMutation: ApproveMutationHandler,
    private readonly rejectMutation: RejectMutationHandler,
    private readonly turnClaims: TurnClaimService,
    private readonly jwtService: JwtService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly drain: ShutdownDrain,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.maxConcurrentTurns = configService.get('AI_MAX_CONCURRENT_STREAMS');
    this.turns = new ConcurrencySlotTracker(this.maxConcurrentTurns);
    drain.register(this.turns);
    this.tokenExpiry = new SocketTokenExpiry({
      slots: this.turns,
      logger: this.logger,
      deferredEvent: 'agent.client.expiry_deferred',
      endSession: (client) => {
        client.emit('agent:error', AIErrors.tokenExpired());
        client.disconnect(true);
      },
    });
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

    let enabled: boolean;
    try {
      enabled = await this.featureFlagsService.isEnabled(
        FEATURE_FLAG_KEYS.AI_ENABLED
      );
    } catch (error) {
      this.logger.error({
        event: 'agent.client.connect_failed',
        clientId: client.id,
        userId: client.data?.userId,
        error: reasonOf(error),
      });
      client.emit(
        'agent:error',
        AIErrors.internalError('Agent connection failed')
      );
      client.disconnect();
      return;
    }
    if (!enabled) {
      client.emit('agent:error', AIErrors.featureDisabled());
      client.disconnect();
      return;
    }

    if (client.connected && auth.tokenExpiresAtMs !== undefined) {
      this.tokenExpiry.arm(client, auth.tokenExpiresAtMs);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.tokenExpiry.clear(client);
    const hadActiveTurns = this.turns.hasActiveSlots(client.id);
    this.turns.abortAllForClient(client.id, TURN_ABORT_REASON.DISCONNECTED);
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
    await this.whileAuthorized(client, (userId) =>
      this.startTurn(client, userId, payload)
    );
  }

  @SubscribeMessage('agent:cancel')
  handleCancel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @Ack() ack?: DeliveryAck
  ): void {
    ack?.();
    this.turns.abortAllForClient(client.id, TURN_ABORT_REASON.CANCELLED);
    this.logger.debug(`Client ${client.id} cancelled agent turn(s)`);
  }

  @SubscribeMessage('agent:approve')
  async handleApprove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: DeliveryAck
  ): Promise<void> {
    ack?.();
    await this.whileAuthorized(client, (userId) =>
      this.approveAndResume(client, userId, payload)
    );
  }

  @SubscribeMessage('agent:reject')
  async handleReject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: DeliveryAck
  ): Promise<void> {
    ack?.();
    await this.whileAuthorized(client, (userId) =>
      this.rejectAndResume(client, userId, payload)
    );
  }

  private async whileAuthorized(
    client: AuthenticatedSocket,
    request: (userId: string) => Promise<void>
  ): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('agent:error', AIErrors.authRequired());
      return;
    }
    if (this.tokenExpiry.isExpired(client)) {
      client.emit('agent:error', AIErrors.tokenExpired());
      return;
    }
    await this.tokenExpiry.track(client, async () => {
      try {
        await request(userId);
      } catch (error) {
        this.answerUnexpectedFailure(client, { userId, error });
      }
    });
  }

  private async startTurn(
    client: AuthenticatedSocket,
    userId: string,
    payload: unknown
  ): Promise<void> {
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
    const onProposal: RunAgentTurnCallbacks['onProposal'] = (proposal) =>
      client.emit('agent:proposal', {
        turnId,
        id: proposal.id,
        kind: proposal.kind,
        targetNoteId: proposal.kind === 'create' ? null : proposal.targetNoteId,
        summary: proposal.summary,
        payload: proposal.payload,
      });
    const turn = {
      userId,
      turnId,
      ...(client.data.isAnonymous && { isAnonymous: true }),
      ...(client.data.clientIp ? { clientIp: client.data.clientIp } : {}),
      ...(data.noteId && { noteId: data.noteId }),
      ...(data.model && { model: data.model }),
      ...(data.effort && { effort: data.effort }),
    };

    await this.runInTurnSlot(
      client,
      userId,
      turnId,
      TURN_LEG.MESSAGE,
      (controller) =>
        this.withTurnClaim(
          client,
          controller,
          turnClaimOf(userId, turnId, data),
          (markSettled, markDiscarded) => {
            const callbacks: RunAgentTurnCallbacks = {
              ...this.baseCallbacks(client, controller, turnId),
              onProposal: (proposal) => {
                this.endedLegs.add(controller);
                onProposal(proposal);
              },
              onModelStart: markSettled,
              onTurnDiscarded: markDiscarded,
              onQuota: (quota) => this.emitQuota(client, turnId, quota),
              onTurnSettled: (conversationId) => {
                markSettled();
                this.endedLegs.add(controller);
                client.emit('agent:turn_settled', { turnId, conversationId });
              },
            };
            return 'continuesTurnId' in data
              ? this.runAgentTurn.continueTurn(
                  {
                    ...turn,
                    conversationId: data.conversationId,
                    continuesTurnId: data.continuesTurnId,
                  },
                  callbacks,
                  controller.signal
                )
              : this.runAgentTurn.execute(
                  {
                    ...turn,
                    message: { content: data.message.content },
                    ...(data.conversationId && {
                      conversationId: data.conversationId,
                    }),
                  },
                  callbacks,
                  controller.signal
                );
          }
        )
    );
  }

  private async approveAndResume(
    client: AuthenticatedSocket,
    userId: string,
    payload: unknown
  ): Promise<void> {
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
    if (this.refuseDecisionWhileDraining(client)) {
      return;
    }
    const res = await this.drain.track(() =>
      this.approveMutation.execute({
        proposalId: parsed.data.proposalId,
        userId,
      })
    );
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

  private async rejectAndResume(
    client: AuthenticatedSocket,
    userId: string,
    payload: unknown
  ): Promise<void> {
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
    if (this.refuseDecisionWhileDraining(client)) {
      return;
    }
    const res = await this.drain.track(() =>
      this.rejectMutation.execute({
        proposalId: parsed.data.proposalId,
        userId,
        ...(parsed.data.reason && { reason: parsed.data.reason }),
      })
    );
    if (res.isErr()) {
      client.emit('agent:error', {
        code: res.error.code,
        message: res.error.message,
      });
      return;
    }
    await this.resumeAfter(client, userId, parsed.data, res.value);
  }

  // Refused before the proposal is taken, so it stays stored for the resend
  // the client makes to the next instance; the error names no turn for the
  // same reason, which is how the client knows nothing was applied.
  private refuseDecisionWhileDraining(client: AuthenticatedSocket): boolean {
    if (!this.drain.isDraining) {
      return false;
    }
    client.emit('agent:error', AgentErrors.turnClaimUnavailable());
    return true;
  }

  private async ensureAiEnabled(client: AuthenticatedSocket): Promise<boolean> {
    if (
      await this.featureFlagsService.isEnabled(FEATURE_FLAG_KEYS.AI_ENABLED)
    ) {
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

  // Stripe's rule: a turn that saves nothing (refused before the model ran,
  // or discarded after it) releases its claim, so a resend of it runs. A turn
  // the conversation already stores outlived its claim, so it is settled like
  // one that ran.
  private async withTurnClaim(
    client: AuthenticatedSocket,
    controller: AbortController,
    claim: TurnClaimRequest | undefined,
    turn: (markSettled: () => void, markDiscarded: () => void) => Promise<void>
  ): Promise<void> {
    if (!claim) {
      return turn(
        () => undefined,
        () => undefined
      );
    }
    const owner = randomUUID();
    const outcome = await this.claimTurn(claim, owner);
    if (outcome !== TURN_CLAIM_OUTCOME.CLAIMED) {
      this.endedLegs.add(controller);
      this.refuseClaimedTurn(client, claim, outcome);
      return;
    }
    let settled = false;
    try {
      await turn(
        () => {
          settled = true;
        },
        () => {
          settled = false;
        }
      );
    } finally {
      await this.releaseStep(claim, () =>
        settled
          ? this.turnClaims.settle(claim, owner)
          : this.turnClaims.release(claim, owner)
      );
      await this.releaseStep(claim, () =>
        this.turnClaims.releaseConversation(
          claim.userId,
          claim.conversationId,
          owner
        )
      );
    }
  }

  // Runs in the finally of a turn, so a throw here would mask the turn's own
  // failure and skip the steps after it.
  private async releaseStep(
    { userId, conversationId, turnId }: TurnClaimRequest,
    step: () => Promise<void>
  ): Promise<void> {
    try {
      await step();
    } catch (error) {
      this.logger.warn({
        event: 'agent.turn.claim_release_failed',
        userId,
        conversationId,
        turnId,
        error: reasonOf(error),
      });
    }
  }

  private async claimTurn(
    claim: TurnClaimRequest,
    owner: string
  ): Promise<TurnClaimOutcome> {
    const outcome = await this.turnClaims.claim(claim, owner);
    if (outcome !== TURN_CLAIM_OUTCOME.CLAIMED) {
      return outcome;
    }
    const lease = await this.turnClaims.claimConversation(
      claim.userId,
      claim.conversationId,
      owner
    );
    if (lease !== TURN_CLAIM_OUTCOME.CLAIMED) {
      await this.turnClaims.release(claim, owner);
    }
    return lease;
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
    if (this.drain.isDraining) {
      client.emit('agent:error', {
        ...AgentErrors.turnClaimUnavailable(),
        turnId,
      });
      return;
    }
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
    } catch (error) {
      const failure = { userId, turnId, leg, error };
      if (this.endedLegs.has(controller) || controller.signal.aborted) {
        this.logUnexpectedFailure(failure);
      } else {
        this.answerUnexpectedFailure(client, failure);
      }
    } finally {
      // The handler ends a turn the drain aborted without a word, so the client
      // is told it is unavailable: it resends a message and ends a resume.
      if (
        controller.signal.reason === SHUTDOWN_ABORT_REASON &&
        !this.endedLegs.has(controller)
      ) {
        client.emit('agent:error', {
          ...AgentErrors.turnClaimUnavailable(),
          turnId,
        });
      }
      this.turns.release(userId, client.id, slotId);
      this.tokenExpiry.afterSlotRelease(client);
    }
  }

  private logUnexpectedFailure({ error, ...turn }: UnexpectedFailure): void {
    this.logger.error({
      event: 'agent.turn.unexpected_failure',
      ...turn,
      error: reasonOf(error),
    });
  }

  private answerUnexpectedFailure(
    client: AuthenticatedSocket,
    failure: UnexpectedFailure
  ): void {
    this.logUnexpectedFailure(failure);
    client.emit('agent:error', {
      ...AIErrors.internalError('Agent turn failed'),
      ...(failure.turnId ? { turnId: failure.turnId } : {}),
    });
  }

  private emitQuota(
    client: AuthenticatedSocket,
    turnId: string,
    quota: AiQuota
  ): void {
    try {
      client.emit('agent:quota', {
        turnId,
        ...quota,
      } satisfies AgentQuotaPayload);
    } catch (error) {
      this.logger.warn({
        event: 'agent.quota.emit_failed',
        turnId,
        error: reasonOf(error),
      });
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
      onDone: (usage) => {
        this.endedLegs.add(controller);
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
          continuable: usage.continuable,
          ...(usage.conversationId
            ? { conversationId: usage.conversationId }
            : {}),
          ...(usage.modelResolution
            ? { modelResolution: usage.modelResolution }
            : {}),
        });
      },
      onError: (error) => {
        if (!controller.signal.aborted) {
          this.endedLegs.add(controller);
          client.emit('agent:error', { ...error, turnId });
        }
      },
    };
  }
}
