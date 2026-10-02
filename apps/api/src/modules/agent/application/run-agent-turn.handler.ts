import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  computeTokenCostUsd,
  detectPromptInjection,
  MAX_GUARD_INPUT_CHARS,
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import {
  AGENT_STOP_REASON,
  BYOK_KEY_FAILURE_KIND,
  deriveConversationTitle,
  isByokKeyFailedError,
  MESSAGE_KIND,
  type AgentStopReason,
  type AiQuota,
  type MessageKind,
  type MessageStopReason,
  type ModelResolution,
  type ReasoningEffort,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../config/env.config';
import { reasonOf } from '../../../core/errors/reason-of';
import { stackOf } from '../../../core/errors/stack-of';
import { AIConfigService } from '../../ai/application/services/ai-config.service';
import {
  logInputDetections,
  type DroppedUserTurn,
  type InputDetectionRow,
} from '../../ai/application/services/ai-input-guard.policy';
import {
  AIRateLimitService,
  type Reservation,
} from '../../ai/application/services/ai-rate-limit.service';
import {
  BYOK_KEY_LOOKUP,
  ByokService,
} from '../../ai/application/services/byok.service';
import { MessageQuotaService } from '../../ai/application/services/message-quota.service';
import { ModelPreferenceService } from '../../ai/application/services/model-preference.service';
import { TierResolver } from '../../ai/application/services/tier-resolver.service';
import {
  TurnEffortResolver,
  type TurnEffortRequest,
} from '../../ai/application/services/turn-effort.resolver';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
import { ByokKeyFailedEvent } from '../../ai/domain/events/byok-key-failed.event';
import {
  billingFor,
  billingMatchesTier,
  type AiExecutionContext,
} from '../../ai/domain/execution-context/ai-execution-context';
import {
  segmentLimits,
  type SegmentLimits,
} from '../../ai/domain/execution-context/segment-policy';
import {
  MODEL_CHOICE,
  type ModelChoice,
} from '../../ai/domain/model-catalog/model-choice';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../ai/domain/ports/embedding.port';
import { AIModel } from '../../ai/domain/value-objects/ai-model.vo';
import { TokenUsage } from '../../ai/domain/value-objects/token-usage.vo';
import { AgentErrors } from '../domain/agent-errors';
import type {
  AgentSource,
  AgentTurnUsage,
  WebSource,
} from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
import {
  COALESCED_MESSAGE_SEPARATOR,
  seamHead,
  seamTail,
} from '../domain/coalesce-messages';
import {
  hasMessagesLeft,
  isContinuable,
  isContinuableStop,
} from '../domain/continuable';
import { TurnCheckpointReachedEvent } from '../domain/events/turn-checkpoint-reached.event';
import { TurnContinuedEvent } from '../domain/events/turn-continued.event';
import {
  AGENT_FIRST_CALL_COSTS,
  AGENT_PROMPT_OVERHEAD_TOKENS,
  firstCallHistoryBudget,
  firstCallRoom,
} from '../domain/first-call-budget';
import { estimateMessageTokens } from '../domain/message-tokens';
import {
  AGENT_ORCHESTRATOR,
  type AgentOrchestrator,
} from '../domain/ports/agent-orchestrator.port';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from '../domain/ports/conversation.repository';
import {
  MEMORY_REPOSITORY,
  type MemoryRepository,
} from '../domain/ports/memory.repository';
import {
  PENDING_MUTATION_STORE,
  type PendingMutationStore,
} from '../domain/ports/pending-mutation.store';
import type { ProposedMutation } from '../domain/proposed-mutation';
import {
  CONTINUE_REQUEST,
  fitHistoryToBudget,
  pruneTranscript,
} from '../domain/prune-transcript';
import {
  coalesceReplayHistory,
  sanitizeReplayHistory,
  type ReplayDetection,
} from '../domain/replay-input-sanitizer';
import { segmentIndexOf } from '../domain/segment-index';
import { isUserCancel } from '../domain/turn-abort';
import { conversationIdForTurn } from '../domain/turn-identity';
import { buildTurnRows } from '../domain/turn-transcript';
import { InjectionGuardService } from './injection-guard.service';

interface RunAgentTurnInput {
  readonly userId: string;
  readonly turnId: string;
  readonly messages?: readonly AgentMessage[];
  readonly isAnonymous?: boolean;
  readonly clientIp?: string;
  readonly noteId?: string;
  readonly knownNotes?: readonly AgentSource[];
  readonly message?: { content: string };
  readonly conversationId?: string;
  readonly model?: string;
  readonly conversationModel?: string | null;
  readonly effort?: ReasoningEffort;
}

type ContinueTurnInput = Pick<
  RunAgentTurnInput,
  | 'userId'
  | 'turnId'
  | 'isAnonymous'
  | 'clientIp'
  | 'noteId'
  | 'model'
  | 'effort'
> & {
  readonly conversationId: string;
  /** The capped turn this one continues; it must be the conversation's newest. */
  readonly continuesTurnId: string;
};

type TurnInput = Omit<
  RunAgentTurnInput,
  'userId' | 'isAnonymous' | 'clientIp'
> & {
  readonly execution: AiExecutionContext;
  /** The text long-term memory is retrieved for; absent when there is none. */
  readonly memoryQuery?: string;
  /** The turn's user message is the server's own CONTINUE_REQUEST, which the injection guard skips. */
  readonly continuation?: boolean;
  /** Which part of the answer to a user message this turn is: 0 for the message's own turn, n for its nth continuation. */
  readonly segmentIndex: number;
  readonly cappedSegmentModel?: string;
};

export interface RunAgentTurnCallbacks {
  readonly onChunk: (text: string) => void;
  readonly onThinking?: (text: string) => void;
  readonly onDone: (usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    costUsd: number;
    sources: readonly AgentSource[];
    knownNotes: readonly AgentSource[];
    webSources: readonly WebSource[];
    stopReason: AgentStopReason;
    /** The turn stopped at a checkpoint and the caller has a message left to continue it. */
    continuable: boolean;
    conversationId?: string;
    /** Which model the turn asked for and which served it. */
    modelResolution?: ModelResolution;
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
  readonly onProposal: (proposal: ProposedMutation) => void;
  /** Fires once, just before the model runs, when the turn named no conversation, with the one it opened; the id must not wait for `done`. A turn refused before the model runs keeps no conversation, so it announces none. */
  readonly onConversation?: (conversationId: string) => void;
  /** Fires once, just before the model runs; a turn that ends without it was refused before any model call. */
  readonly onModelStart?: () => void;
  /** Fires after the turn draws or gives back one of today's messages. */
  readonly onQuota?: (quota: AiQuota) => void;
  /** Fires instead of running when the turn id is already stored in the conversation. */
  readonly onTurnSettled?: (conversationId: string) => void;
}

type TurnEventOutcome = 'continue' | 'stop';

interface ResolvedModel {
  readonly model: string;
  readonly resolution: ModelResolution;
}

interface TurnLoopContext {
  readonly execution: AiExecutionContext;
  readonly reservation: Reservation;
  readonly model: string;
  readonly resolution: ModelResolution;
  reconciled: boolean;
}

interface PersistenceContext {
  readonly conversationId: string;
  readonly turnId: string;
  readonly userContent?: string;
  readonly userKind?: MessageKind;
}

interface TurnLoopPolicy {
  readonly onProposal: (
    event: { proposal: ProposedMutation; usage: AgentTurnUsage },
    ctx: TurnLoopContext
  ) => Promise<TurnEventOutcome>;
  readonly consumesQuota: boolean;
}

interface QuotaHold {
  readonly refund: () => Promise<void>;
  readonly quota: () => AiQuota | null;
}

const NO_QUOTA_HOLD: QuotaHold = {
  refund: () => Promise.resolve(),
  quota: () => null,
};

const PREPARED_TURN = {
  REFUSED: 'refused',
  TOO_LARGE: 'too_large',
  BUDGET_DENIED: 'budget_denied',
  READY: 'ready',
} as const;

type PreparedTurn =
  | { readonly kind: typeof PREPARED_TURN.REFUSED }
  | { readonly kind: typeof PREPARED_TURN.TOO_LARGE }
  | {
      readonly kind: typeof PREPARED_TURN.BUDGET_DENIED;
      readonly reason?: string;
    }
  | {
      readonly kind: typeof PREPARED_TURN.READY;
      readonly messages: AgentMessage[];
      readonly userMemories: string[];
      readonly limits: SegmentLimits;
      readonly openrouterProviderOrder: readonly string[];
      readonly openrouterIgnoredProviders: readonly string[];
      readonly reservation: Reservation;
    };

export const AGENT_HISTORY_TOKEN_BUDGET = 12_000;
const FIRST_CALL_UNAFFORDABLE_EVENT = 'agent.turn.first_call_unaffordable';
const AGENT_HISTORY_TOOL_TURNS = 2;
const MAX_USER_MESSAGE_CHARS = MAX_GUARD_INPUT_CHARS;
function detectionRows(
  detections: readonly ReplayDetection[],
  messages: readonly AgentMessage[]
): InputDetectionRow[] {
  return detections.map(({ index, detection, disposition, redactedSpans }) => ({
    detection,
    disposition,
    redactedSpans,
    role: messages[index].role,
  }));
}

// A continuation's user message is our own CONTINUE_REQUEST, so memory
// retrieval embeds the last message the user actually wrote.
function lastWrittenUserMessage(
  history: readonly AgentMessage[]
): string | undefined {
  return history.findLast(
    (m) => m.role === 'user' && m.content !== CONTINUE_REQUEST
  )?.content;
}

function freshUserMessageOf(
  input: TurnInput,
  resume: { outcome: string } | undefined
): AgentMessage | undefined {
  if (input.continuation) {
    return { role: 'user', content: CONTINUE_REQUEST };
  }
  return resume === undefined && input.message
    ? { role: 'user', content: input.message.content }
    : undefined;
}

function messageTooLongError() {
  return AIErrors.invalidInput(
    `Message exceeds the maximum length of ${MAX_USER_MESSAGE_CHARS} characters`
  );
}

function turnTooLargeError() {
  return AIErrors.invalidInput(
    'Message and conversation exceed what one turn can process'
  );
}

@Injectable()
export class RunAgentTurnHandler {
  private readonly logger = new Logger(RunAgentTurnHandler.name);

  constructor(
    @Inject(AGENT_ORCHESTRATOR)
    private readonly orchestrator: AgentOrchestrator,
    private readonly rateLimit: AIRateLimitService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(PENDING_MUTATION_STORE)
    private readonly pendingStore: PendingMutationStore,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(MEMORY_REPOSITORY)
    private readonly memory: MemoryRepository,
    @Inject(EMBEDDING_PORT)
    private readonly embed: EmbeddingPort,
    private readonly modelPreference: ModelPreferenceService,
    private readonly byok: ByokService,
    private readonly injectionGuard: InjectionGuardService,
    private readonly aiConfig: AIConfigService,
    private readonly turnEffort: TurnEffortResolver,
    private readonly tierResolver: TierResolver,
    private readonly quota: MessageQuotaService,
    private readonly events: EventEmitter2
  ) {}

  async execute(
    input: RunAgentTurnInput,
    callbacks: RunAgentTurnCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    if (!input.message) {
      callbacks.onError(AIErrors.validationError('message is required'));
      return;
    }
    // Resolve and reject before resolveConversation so a refused turn leaves no row behind.
    const execution = await this.resolveExecution(input, callbacks);
    if (!execution) {
      return;
    }
    if (input.effort && !execution.policy.effortSelectable) {
      callbacks.onError(
        AIErrors.validationError('effort is not available on anonymous turns')
      );
      return;
    }
    return this.executeWithMemory(input, execution, callbacks, signal);
  }

  private async resolveExecution(
    input: RunAgentTurnInput,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>
  ): Promise<AiExecutionContext | null> {
    try {
      return await this.tierResolver.resolve({
        userId: input.userId,
        isAnonymous: input.isAnonymous === true,
        ...(input.clientIp ? { clientIp: input.clientIp } : {}),
      });
    } catch (error) {
      this.logger.warn({
        event: 'agent.tier.resolve_failed',
        userId: input.userId,
        error: reasonOf(error),
      });
      callbacks.onError(AIErrors.providerError('Model resolution failed'));
      return null;
    }
  }

  private executePolicy(
    callbacks: RunAgentTurnCallbacks,
    persistence: PersistenceContext
  ): TurnLoopPolicy {
    return {
      onProposal: async (event, ctx) => {
        await this.recordUsage(ctx, event.usage);
        ctx.reconciled = true;
        await this.pendingStore.save({
          userId: ctx.execution.subject.userId,
          turnId: persistence.turnId,
          mutation: event.proposal,
          conversationId: persistence.conversationId,
        });
        callbacks.onProposal(event.proposal);
        return 'stop';
      },
      consumesQuota: true,
    };
  }

  private async executeWithMemory(
    input: RunAgentTurnInput,
    execution: AiExecutionContext,
    callbacks: RunAgentTurnCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const message = input.message;
    if (!message) {
      return;
    }
    // Reject before resolveConversation so an oversized first message leaves
    // no titled conversation row behind.
    if (message.content.length > MAX_USER_MESSAGE_CHARS) {
      callbacks.onError(messageTooLongError());
      return;
    }
    const conversation = await this.resolveConversation(input, message);
    if (!conversation) {
      callbacks.onError(AgentErrors.conversationNotFound());
      return;
    }
    const conversationId = conversation.id;
    // A turn refused before the model runs deletes the conversation it
    // created, so the client learns the id only once the model starts.
    let modelStarted = false;
    const onModelStart = () => {
      modelStarted = true;
      if (conversation.opened) {
        callbacks.onConversation?.(conversationId);
      }
      callbacks.onModelStart?.();
    };
    try {
      if (await this.alreadyStored(conversationId, input.turnId, callbacks)) {
        return;
      }
      const { history, knownNotes } = await this.loadConversationContext(
        conversationId,
        input.userId
      );
      const synthInput: TurnInput = {
        turnId: input.turnId,
        messages: history,
        message,
        execution,
        memoryQuery: message.content,
        ...(input.noteId ? { noteId: input.noteId } : {}),
        knownNotes,
        segmentIndex: 0,
        ...(input.model ? { model: input.model } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
        conversationModel: conversation.model,
      };
      const persistence: PersistenceContext = {
        conversationId,
        turnId: input.turnId,
        userContent: message.content,
      };
      await this.runLoop(
        synthInput,
        undefined,
        { ...callbacks, onModelStart },
        signal,
        this.executePolicy(callbacks, persistence),
        persistence
      );
    } finally {
      if (conversation.created && !modelStarted) {
        await this.discardUnusedConversation(conversationId, input.userId);
      }
    }
  }

  private async discardUnusedConversation(
    conversationId: string,
    userId: string
  ): Promise<void> {
    try {
      await this.conversations.deleteForUser(conversationId, userId);
    } catch (error) {
      this.logger.warn({
        event: 'agent.conversation.discard_failed',
        conversationId,
        error: reasonOf(error),
      });
    }
  }

  // The turn claim expires after 24 h; past it, only the stored row proves the
  // turn ran, so it is checked before any message is drawn.
  private async alreadyStored(
    conversationId: string,
    turnId: string,
    callbacks: Pick<RunAgentTurnCallbacks, 'onTurnSettled'>
  ): Promise<boolean> {
    if (!(await this.conversations.hasTurn(conversationId, turnId))) {
      return false;
    }
    this.logger.log({
      event: 'agent.turn.already_stored',
      conversationId,
      turnId,
    });
    callbacks.onTurnSettled?.(conversationId);
    return true;
  }

  private async loadUserMemories(
    execution: AiExecutionContext,
    memoryQuery: string
  ): Promise<string[]> {
    if (!execution.policy.longTermMemory) {
      return [];
    }
    const { userId } = execution.subject;
    // A resume embeds a replayed row the fresh-message guard never saw, so
    // oversized or injected text must not reach the paid embed call.
    if (
      memoryQuery.length > MAX_USER_MESSAGE_CHARS ||
      !detectPromptInjection(memoryQuery).safe
    ) {
      return [];
    }
    try {
      if (!this.embed.isConfigured()) {
        return [];
      }
      const k = this.configService.get('AI_MEMORY_RETRIEVAL_K');
      const min = this.configService.get('AI_MEMORY_SIMILARITY_MIN');
      const { vector, costUsd } = await this.embed.embedQuery(memoryQuery);
      void this.rateLimit.recordSideCost(execution, {
        action: 'embedding',
        model: this.configService.get('AI_EMBEDDING_MODEL'),
        costUsd,
      });
      const matches = await this.memory.searchForUser(userId, vector, k);
      return matches.filter((m) => m.score >= min).map((m) => m.content);
    } catch (error) {
      this.logger.warn(
        'Long-term memory retrieval failed; proceeding without it',
        stackOf(error)
      );
      return [];
    }
  }

  private async resolveConversation(
    input: RunAgentTurnInput,
    message: { content: string }
  ): Promise<{
    id: string;
    model: string | null;
    opened: boolean;
    created: boolean;
  } | null> {
    if (input.conversationId) {
      const existing = await this.conversations.findByIdForUser(
        input.conversationId,
        input.userId
      );
      return existing ? { ...existing, opened: false, created: false } : null;
    }
    const id = conversationIdForTurn(input.userId, input.turnId);
    const replayed = await this.conversations.findByIdForUser(id, input.userId);
    if (replayed) {
      return { ...replayed, opened: true, created: false };
    }
    const created = await this.conversations.create({
      id,
      userId: input.userId,
      ...(input.noteId ? { noteId: input.noteId } : {}),
      title: deriveConversationTitle(message.content) || null,
    });
    return { id: created.id, model: null, opened: true, created: true };
  }

  private async loadConversationContext(
    conversationId: string,
    userId: string
  ): Promise<{
    history: AgentMessage[];
    knownNotes: AgentSource[];
    segmentIndex: number;
  }> {
    const limit = this.configService.get('AI_AGENT_HISTORY_LIMIT');
    const rows = await this.conversations.loadMessages(
      conversationId,
      userId,
      limit
    );
    const history = pruneTranscript(rows, {
      keepToolTurns: AGENT_HISTORY_TOOL_TURNS,
    });
    const seen = new Map<string, AgentSource>();
    for (const r of rows) {
      if (r.role !== 'assistant') {
        continue;
      }
      for (const s of r.sources) {
        if (!seen.has(s.id)) {
          seen.set(s.id, s);
        }
      }
    }
    return {
      history,
      knownNotes: [...seen.values()],
      segmentIndex: segmentIndexOf(rows),
    };
  }

  private async persistTurn(
    persistence: PersistenceContext,
    turnMessages: readonly AgentMessage[],
    assistantText: string,
    sources: readonly AgentSource[],
    stopReason: MessageStopReason,
    servedModel?: string
  ): Promise<boolean> {
    const messages = buildTurnRows({
      userContent: persistence.userContent,
      ...(persistence.userKind ? { userKind: persistence.userKind } : {}),
      turnMessages,
      assistantText,
      sources,
      stopReason,
      ...(servedModel ? { model: servedModel } : {}),
    });
    if (messages.length === 0) {
      return false;
    }
    try {
      const persisted = await this.conversations.appendTurn({
        conversationId: persistence.conversationId,
        turnId: persistence.turnId,
        messages,
      });
      if (!persisted) {
        return false;
      }
      this.logger.log({
        event: 'agent.conversation.persisted',
        conversationId: persistence.conversationId,
        turnId: persistence.turnId,
        rows: messages.length,
        toolRows: messages.filter((m) => m.role === 'tool').length,
        stopReason,
      });
      return true;
    } catch (error) {
      this.logger.error({
        event: 'agent.conversation.persist_failed',
        conversationId: persistence.conversationId,
        error: reasonOf(error),
      });
      return false;
    }
  }

  private resumePolicy(
    callbacks: Pick<
      RunAgentTurnCallbacks,
      'onChunk' | 'onDone' | 'onError' | 'onThinking'
    >
  ): TurnLoopPolicy {
    return {
      onProposal: async (event, ctx) => {
        this.logger.warn({
          event: 'agent.resume.proposal_dropped',
          userId: ctx.execution.subject.userId,
          proposalId: event.proposal.id,
          summary: event.proposal.summary,
        });
        const costUsd = await this.recordUsage(ctx, event.usage);
        ctx.reconciled = true;
        callbacks.onDone({
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          model: event.usage.model,
          costUsd,
          sources: [],
          knownNotes: [],
          webSources: [],
          stopReason: AGENT_STOP_REASON.COMPLETED,
          continuable: false,
          modelResolution: ctx.resolution,
        });
        return 'stop';
      },
      consumesQuota: false,
    };
  }

  async resumeTurn(
    input: RunAgentTurnInput & {
      conversationId: string;
      resume: { outcome: string };
    },
    callbacks: Pick<
      RunAgentTurnCallbacks,
      'onChunk' | 'onDone' | 'onError' | 'onThinking'
    >,
    signal?: AbortSignal
  ): Promise<void> {
    const execution = await this.resolveExecution(input, callbacks);
    if (!execution) {
      return;
    }
    const found = await this.conversations.findByIdForUser(
      input.conversationId,
      input.userId
    );
    if (!found) {
      callbacks.onError(AgentErrors.conversationNotFound());
      return;
    }
    const { history, knownNotes, segmentIndex } =
      await this.loadConversationContext(input.conversationId, input.userId);
    // A resume carries a tool-confirmation outcome, not the user's words, so
    // memory retrieval embeds the last real user message instead.
    const memoryQuery = lastWrittenUserMessage(history);
    const synthInput: TurnInput & {
      resume: { outcome: string };
    } = {
      turnId: input.turnId,
      messages: history,
      knownNotes,
      segmentIndex,
      execution,
      ...(memoryQuery ? { memoryQuery } : {}),
      ...(input.noteId ? { noteId: input.noteId } : {}),
      conversationModel: found.model,
      resume: input.resume,
    };
    return this.runLoop(
      synthInput,
      input.resume,
      callbacks,
      signal,
      this.resumePolicy(callbacks),
      { conversationId: input.conversationId, turnId: input.turnId }
    );
  }

  /** Runs a new turn that picks up where a capped one stopped; it is metered, streams and persists like any turn. */
  async continueTurn(
    input: ContinueTurnInput,
    callbacks: RunAgentTurnCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const execution = await this.resolveExecution(input, callbacks);
    if (!execution) {
      return;
    }
    if (input.effort && !execution.policy.effortSelectable) {
      callbacks.onError(
        AIErrors.validationError('effort is not available on anonymous turns')
      );
      return;
    }
    const found = await this.conversations.findByIdForUser(
      input.conversationId,
      input.userId
    );
    if (!found) {
      callbacks.onError(AgentErrors.conversationNotFound());
      return;
    }
    if (
      await this.alreadyStored(input.conversationId, input.turnId, callbacks)
    ) {
      return;
    }
    const last = await this.conversations.findLastMessage(
      input.conversationId,
      input.userId
    );
    if (
      last?.role !== 'assistant' ||
      last.turnId !== input.continuesTurnId ||
      !isContinuableStop(last.stopReason)
    ) {
      callbacks.onError(AgentErrors.turnNotContinuable());
      return;
    }
    const context = await this.loadConversationContext(
      input.conversationId,
      input.userId
    );
    const segmentIndex = context.segmentIndex + 1;
    const memoryQuery = lastWrittenUserMessage(context.history);
    const persistence: PersistenceContext = {
      conversationId: input.conversationId,
      turnId: input.turnId,
      userContent: '',
      userKind: MESSAGE_KIND.CONTINUE,
    };
    const onModelStart = () => {
      callbacks.onModelStart?.();
      this.announce(
        new TurnContinuedEvent(
          execution.subject.userId,
          execution.tier,
          segmentIndex
        )
      );
    };
    return this.runLoop(
      {
        turnId: input.turnId,
        messages: context.history,
        execution,
        continuation: true,
        knownNotes: context.knownNotes,
        segmentIndex,
        conversationModel: found.model,
        ...(last.model ? { cappedSegmentModel: last.model } : {}),
        ...(memoryQuery ? { memoryQuery } : {}),
        ...(input.noteId ? { noteId: input.noteId } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
      },
      undefined,
      { ...callbacks, onModelStart },
      signal,
      this.executePolicy(callbacks, persistence),
      persistence
    );
  }

  private async runLoop(
    input: TurnInput,
    resume: { outcome: string } | undefined,
    callbacks: Pick<
      RunAgentTurnCallbacks,
      | 'onChunk'
      | 'onDone'
      | 'onError'
      | 'onThinking'
      | 'onModelStart'
      | 'onQuota'
    >,
    signal: AbortSignal | undefined,
    policy: TurnLoopPolicy,
    persistence: PersistenceContext | undefined
  ): Promise<void> {
    if (signal?.aborted) {
      return;
    }
    const { userId } = input.execution.subject;

    // The guards, the memory embedding and the budget gate all charge the
    // turn's payer, so the model and its billing must be resolved before any
    // of them; a BYOK turn also skips the daily token/cost ceiling.
    let resolved: ResolvedModel | null;
    try {
      resolved = await this.resolveModel(input, callbacks, Boolean(resume));
    } catch (error) {
      this.logger.error({
        event: 'agent.model_resolution_failed',
        userId,
        error: reasonOf(error),
      });
      callbacks.onError(AIErrors.providerError('Model resolution failed'));
      return;
    }
    if (resolved === null) {
      return;
    }
    const { model } = resolved;
    const modelResult = AIModel.create(model, this.modelCatalog);
    if (modelResult.isErr()) {
      callbacks.onError(modelResult.error);
      return;
    }

    const execution = billingFor(input.execution, providerOf(model));
    if (!billingMatchesTier(execution)) {
      this.logger.error({
        event: 'agent.billing.tier_mismatch',
        userId,
        tier: execution.tier,
        model,
      });
      callbacks.onError(AIErrors.modelUnavailable('not_in_tier', null));
      return;
    }
    let byokApiKey: string | null = null;
    if (execution.billing.kind === 'byok') {
      const { provider } = execution.billing;
      const key = await this.byok.resolveKey(userId, provider);
      // Fail closed: the model was selectable on the user's key, so never bill
      // the server's key as a silent fallback when that key is unavailable.
      switch (key.kind) {
        case BYOK_KEY_LOOKUP.FOUND:
          byokApiKey = key.apiKey;
          break;
        case BYOK_KEY_LOOKUP.UNDECRYPTABLE:
          this.announce(
            new ByokKeyFailedEvent(userId, provider, BYOK_KEY_FAILURE_KIND.AUTH)
          );
          callbacks.onError(
            AIErrors.byokKeyFailed(provider, BYOK_KEY_FAILURE_KIND.AUTH)
          );
          return;
        case BYOK_KEY_LOOKUP.MISSING: {
          const refusal = AIErrors.modelUnavailable('key_removed', null);
          this.logger.warn({
            event: 'ai.model.unavailable',
            userId,
            tier: execution.tier,
            reason: refusal.reason,
            model,
          });
          callbacks.onError(refusal);
          return;
        }
        default: {
          const _exhaustive: never = key;
          throw new Error(`Unhandled key lookup: ${String(_exhaustive)}`);
        }
      }
    }

    const freshUserMessage = freshUserMessageOf(input, resume);
    if (
      freshUserMessage &&
      freshUserMessage.content.length > MAX_USER_MESSAGE_CHARS
    ) {
      callbacks.onError(messageTooLongError());
      return;
    }
    // The injection classifier is itself a model call, so the message is
    // drawn before it: an exhausted caller must not reach any model.
    const hold = policy.consumesQuota
      ? await this.holdQuota(execution, input.turnId, callbacks)
      : NO_QUOTA_HOLD;
    if (!hold) {
      return;
    }
    let prepared: PreparedTurn;
    try {
      prepared = await this.prepareTurn(
        input,
        execution,
        model,
        freshUserMessage,
        persistence,
        callbacks
      );
    } catch (error) {
      await hold.refund();
      throw error;
    }
    if (prepared.kind === PREPARED_TURN.REFUSED) {
      return;
    }
    if (prepared.kind === PREPARED_TURN.TOO_LARGE) {
      await hold.refund();
      callbacks.onError(turnTooLargeError());
      return;
    }
    if (prepared.kind === PREPARED_TURN.BUDGET_DENIED) {
      await hold.refund();
      callbacks.onError(AIErrors.rateLimitExceeded(prepared.reason));
      return;
    }

    const ctx: TurnLoopContext = {
      execution,
      reservation: prepared.reservation,
      model,
      resolution: resolved.resolution,
      reconciled: false,
    };
    // Only an admitted turn may repin the conversation: a HITL resume serves
    // the stored model, so a refused turn must leave it untouched.
    if (!(await this.persistRequestedModel(input, persistence))) {
      await this.recordUsageSafe(ctx, {
        inputTokens: 0,
        outputTokens: 0,
        model,
      });
      await hold.refund();
      callbacks.onError(AIErrors.providerError('Model resolution failed'));
      return;
    }

    const turnMessages: AgentMessage[] = [];
    let assistantText = '';
    let answered = false;
    let persisted = false;
    let stored = false;
    const persistTurnOnce = async (
      sources: readonly AgentSource[],
      stopReason: MessageStopReason,
      servedModel?: string
    ): Promise<boolean> => {
      if (!persistence || persisted) {
        return stored;
      }
      persisted = true;
      stored = await this.persistTurn(
        persistence,
        turnMessages,
        assistantText,
        sources,
        stopReason,
        servedModel
      );
      return stored;
    };
    const persistFailedTurn = async (
      stopReason: 'error' | 'aborted'
    ): Promise<void> => {
      if (input.continuation && !answered) {
        return;
      }
      await persistTurnOnce([], stopReason);
    };
    if (signal?.aborted) {
      await this.recordUsageSafe(ctx, {
        inputTokens: 0,
        outputTokens: 0,
        model,
      });
      if (!isUserCancel(signal)) {
        await hold.refund();
      }
      return;
    }
    callbacks.onModelStart?.();
    try {
      for await (const event of this.orchestrator.run({
        execution,
        messages: prepared.messages,
        model,
        maxSteps: prepared.limits.maxSteps,
        maxTurnTokens: prepared.limits.maxTurnTokens,
        effortFor: (candidate: string) =>
          this.effortForModel({
            execution,
            model: candidate,
            requested: input.effort,
          }),
        openrouterProviderOrder: prepared.openrouterProviderOrder,
        openrouterIgnoredProviders: prepared.openrouterIgnoredProviders,
        ...(input.noteId ? { noteId: input.noteId } : {}),
        ...(input.knownNotes ? { knownNotes: input.knownNotes } : {}),
        ...(prepared.userMemories.length
          ? { userMemories: prepared.userMemories }
          : {}),
        ...(signal ? { signal } : {}),
        ...(resume ? { resume } : {}),
        ...(byokApiKey ? { byokApiKey } : {}),
      })) {
        switch (event.type) {
          case 'thinking':
            callbacks.onThinking?.(event.text);
            break;
          case 'chunk':
            assistantText += event.text;
            answered ||= event.text.length > 0;
            callbacks.onChunk(event.text);
            break;
          case 'error':
            await this.recordUsageSafe(
              ctx,
              event.usage ?? { inputTokens: 0, outputTokens: 0, model }
            );
            ctx.reconciled = true;
            await persistFailedTurn('error');
            if (!answered) {
              await hold.refund();
            }
            if (
              isByokKeyFailedError(event.error) &&
              execution.billing.kind === 'byok'
            ) {
              this.announce(
                new ByokKeyFailedEvent(
                  userId,
                  execution.billing.provider,
                  event.error.kind
                )
              );
            }
            callbacks.onError(event.error);
            return;
          case 'aborted':
            await this.recordUsageSafe(ctx, event.usage);
            ctx.reconciled = true;
            await persistFailedTurn('aborted');
            if (!answered && !isUserCancel(signal)) {
              await hold.refund();
            }
            return;
          case 'done': {
            let costUsd: number;
            try {
              costUsd = await this.recordUsage(ctx, event.usage);
              ctx.reconciled = true;
            } catch (error) {
              this.logger.warn({
                event: 'agent.usage.record_failed',
                userId,
                error: reasonOf(error),
              });
              costUsd = TokenUsage.create(
                {
                  inputTokens: event.usage.inputTokens,
                  outputTokens: event.usage.outputTokens,
                  model: event.usage.model,
                  cacheReadTokens: event.usage.cacheReadTokens,
                  cacheWriteTokens: event.usage.cacheWriteTokens,
                },
                this.modelCatalog.getPricing(event.usage.model)
              ).costUsd;
            }
            if (execution.billing.kind === 'byok') {
              void this.byok.markUsed(userId, execution.billing.provider);
            }
            const turnStored = await persistTurnOnce(
              event.sources,
              event.stopReason,
              event.usage.model
            );
            if (isContinuableStop(event.stopReason)) {
              this.announce(
                new TurnCheckpointReachedEvent(
                  userId,
                  execution.tier,
                  event.stopReason,
                  input.segmentIndex
                )
              );
            }
            const continuable =
              turnStored &&
              (policy.consumesQuota
                ? isContinuable(event.stopReason, hold.quota())
                : await this.continuableFromSnapshot(
                    event.stopReason,
                    input.execution
                  ));
            callbacks.onDone({
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              model: event.usage.model,
              costUsd,
              sources: event.sources,
              knownNotes: event.knownNotes,
              webSources: event.webSources,
              stopReason: event.stopReason,
              continuable,
              ...(persistence
                ? { conversationId: persistence.conversationId }
                : {}),
              modelResolution: ctx.resolution,
            });
            return;
          }
          case 'proposal':
            // Empty because proposal events carry no sources; the post-approval
            // turn re-derives them.
            await persistTurnOnce(
              [],
              AGENT_STOP_REASON.COMPLETED,
              event.usage.model
            );
            if ((await policy.onProposal(event, ctx)) === 'stop') {
              return;
            }
            break;
          case 'step':
            turnMessages.push(...event.messages);
            break;
          default: {
            const _exhaustive: never = event;
            throw new Error(`Unhandled agent event: ${String(_exhaustive)}`);
          }
        }
      }
      this.logger.error({
        event: 'agent.turn.no_terminal',
        userId,
      });
      if (!ctx.reconciled) {
        await this.recordUsageSafe(ctx, {
          inputTokens: 0,
          outputTokens: 0,
          model: ctx.model,
        });
      }
      await persistFailedTurn('error');
      if (!answered) {
        await hold.refund();
      }
      callbacks.onError(
        AIErrors.providerError('Agent turn ended without a terminal event')
      );
    } catch (error) {
      await persistFailedTurn(signal?.aborted ? 'aborted' : 'error');
      if (signal?.aborted) {
        if (!ctx.reconciled) {
          await this.recordUsageSafe(ctx, {
            inputTokens: 0,
            outputTokens: 0,
            model: ctx.model,
          });
        }
        if (!answered && !isUserCancel(signal)) {
          await hold.refund();
        }
        return;
      }
      this.logger.error({
        event: 'agent.turn.unexpected_error',
        userId,
        error: reasonOf(error),
      });
      if (!ctx.reconciled) {
        await this.recordUsageSafe(ctx, {
          inputTokens: 0,
          outputTokens: 0,
          model: ctx.model,
        });
      }
      if (!answered) {
        await hold.refund();
      }
      callbacks.onError(AIErrors.providerError('Agent turn failed'));
    }
  }

  private async holdQuota(
    execution: AiExecutionContext,
    turnId: string,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError' | 'onQuota'>
  ): Promise<QuotaHold | null> {
    const outcome = await this.quota.consume(execution, turnId);
    switch (outcome.kind) {
      case 'unmetered':
        return NO_QUOTA_HOLD;
      case 'consumed': {
        this.reportQuota(callbacks, outcome.quota, turnId);
        let refunded = false;
        return {
          refund: async () => {
            if (refunded) {
              return;
            }
            refunded = true;
            const quota = await this.quota.refund(outcome.receipt);
            if (quota) {
              this.reportQuota(callbacks, quota, turnId);
            }
          },
          quota: () => outcome.quota,
        };
      }
      case 'exhausted':
        callbacks.onError(
          AIErrors.quotaExhausted(outcome.resetsAt, outcome.upgrade)
        );
        return null;
      case 'unavailable':
        callbacks.onError(AgentErrors.turnClaimUnavailable());
        return null;
      default: {
        const _exhaustive: never = outcome;
        throw new Error(`Unhandled quota outcome: ${String(_exhaustive)}`);
      }
    }
  }

  // A leg that draws no message holds NO_QUOTA_HOLD, whose null reads as
  // unmetered; a platform caller is metered, so the quota is read instead.
  private async continuableFromSnapshot(
    stopReason: AgentStopReason,
    execution: AiExecutionContext
  ): Promise<boolean> {
    if (!isContinuableStop(stopReason)) {
      return false;
    }
    try {
      return hasMessagesLeft(await this.quota.snapshot(execution));
    } catch (error) {
      this.logger.warn({
        event: 'agent.continuable.snapshot_failed',
        userId: execution.subject.userId,
        error: reasonOf(error),
      });
      return false;
    }
  }

  private reportQuota(
    callbacks: Pick<RunAgentTurnCallbacks, 'onQuota'>,
    quota: AiQuota,
    turnId: string
  ): void {
    try {
      callbacks.onQuota?.(quota);
    } catch (error) {
      this.logger.warn({
        event: 'agent.quota.report_failed',
        turnId,
        tier: quota.tier,
        error: reasonOf(error),
      });
    }
  }

  private announce(
    event: TurnCheckpointReachedEvent | TurnContinuedEvent | ByokKeyFailedEvent
  ): void {
    try {
      this.events.emit(event.name, event);
    } catch (error) {
      this.logger.warn({
        event: 'agent.turn.announce_failed',
        domainEvent: event.name,
        error: reasonOf(error),
      });
    }
  }

  private async prepareTurn(
    input: TurnInput,
    execution: AiExecutionContext,
    model: string,
    freshUserMessage: AgentMessage | undefined,
    persistence: PersistenceContext | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>
  ): Promise<PreparedTurn> {
    const { userId } = execution.subject;
    // Resolve turn settings before the budget reservation: a settings-store
    // failure must escape before any reservation exists, else the held
    // reservation leaks with no client-facing error.
    const limits = segmentLimits(execution, {
      maxSteps: this.configService.get('AI_AGENT_MAX_STEPS'),
      byokMaxSteps: this.configService.get('AI_AGENT_BYOK_MAX_STEPS'),
      turnTokenBudget: this.configService.get('AI_AGENT_TURN_TOKEN_BUDGET'),
      dailyTokenAllowance: this.rateLimit.dailyAllowance(execution).tokenLimit,
    });
    const firstCall = {
      ...AGENT_FIRST_CALL_COSTS,
      maxTurnTokens: limits.maxTurnTokens,
      maxOutputTokens: this.configService.get('AI_AGENT_MAX_OUTPUT_TOKENS'),
    };
    const room = firstCallRoom(firstCall);
    const historyBudget = firstCallHistoryBudget({
      ...firstCall,
      historyCap: AGENT_HISTORY_TOKEN_BUDGET,
    });
    // The guard's gray-zone classifier bills the payer, so an oversized
    // message must not reach it.
    const freshTokens = freshUserMessage
      ? estimateMessageTokens(freshUserMessage)
      : 0;
    if (freshTokens > room) {
      return this.firstCallUnaffordable(
        execution,
        firstCall,
        room,
        freshTokens
      );
    }
    if (freshUserMessage && !input.continuation) {
      const verdict = await this.injectionGuard.guard(
        freshUserMessage.content,
        execution
      );
      if (!verdict.safe) {
        callbacks.onError(AIErrors.promptInjectionDetected());
        return { kind: PREPARED_TURN.REFUSED };
      }
    }
    const inputMessages = input.messages ?? [];
    const sanitized = sanitizeReplayHistory(inputMessages);
    const fitted = await this.fitGuardedHistory(
      sanitized.messages,
      freshUserMessage,
      execution,
      historyBudget
    );
    logInputDetections(
      this.logger,
      [
        ...detectionRows(sanitized.detections, inputMessages),
        ...detectionRows(fitted.detections, fitted.messages),
      ],
      {
        surface: 'history',
        userId,
        ...(persistence ? { conversationId: persistence.conversationId } : {}),
      },
      fitted.dropped
    );
    const messages = fitted.messages;
    const estimatedTokens = this.estimateTokens(messages);
    const fittedTokens = estimatedTokens - AGENT_PROMPT_OVERHEAD_TOKENS;
    // The newest turn is kept past the history cap, so only a turn that
    // overruns the first call's whole room is refused.
    if (fittedTokens > room) {
      return this.firstCallUnaffordable(
        execution,
        firstCall,
        room,
        fittedTokens
      );
    }
    const pricing = this.modelCatalog.getPricing(model);
    const estimatedCostUsd = pricing
      ? computeTokenCostUsd(
          { inputTokens: estimatedTokens, outputTokens: 0 },
          pricing
        )
      : 0;
    const userMemories = input.memoryQuery
      ? await this.loadUserMemories(execution, input.memoryQuery)
      : [];
    const [openrouterProviderOrder, openrouterIgnoredProviders] =
      await Promise.all([
        this.aiConfig.getOpenRouterProviderOrder(),
        this.aiConfig.getOpenRouterIgnoredProviders(),
      ]);
    const limit = await this.rateLimit.checkLimit(execution, {
      tokens: estimatedTokens,
      costUsd: estimatedCostUsd,
    });
    if (!limit.allowed) {
      return {
        kind: PREPARED_TURN.BUDGET_DENIED,
        ...(limit.reason !== undefined ? { reason: limit.reason } : {}),
      };
    }
    return {
      kind: PREPARED_TURN.READY,
      messages,
      userMemories,
      limits,
      openrouterProviderOrder,
      openrouterIgnoredProviders,
      reservation: limit.reservation,
    };
  }

  private firstCallUnaffordable(
    execution: AiExecutionContext,
    firstCall: { readonly maxTurnTokens: number },
    room: number,
    fittedTokens: number
  ): PreparedTurn {
    this.logger.warn({
      event: FIRST_CALL_UNAFFORDABLE_EVENT,
      userId: execution.subject.userId,
      tier: execution.tier,
      room,
      fittedTokens,
      maxTurnTokens: firstCall.maxTurnTokens,
    });
    return { kind: PREPARED_TURN.TOO_LARGE };
  }

  /**
   * The effort for one model this turn serves. Every model a turn serves shares
   * the turn's billing — a BYOK turn never fails over — so the audience is the
   * turn's, not the candidate provider's. A failed lookup degrades to no
   * reasoning option: it must not fail the model the chain is about to try.
   */
  private async effortForModel(
    request: TurnEffortRequest
  ): Promise<ReasoningEffort | undefined> {
    try {
      return await this.turnEffort.resolve(request);
    } catch (error) {
      this.logger.warn({
        event: 'agent.effort_lookup_failed',
        model: request.model,
        error: reasonOf(error),
      });
      return undefined;
    }
  }

  private async resolveModel(
    input: TurnInput,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>,
    resuming: boolean
  ): Promise<ResolvedModel | null> {
    const { userId } = input.execution.subject;
    const pinned = resuming ? (input.conversationModel ?? null) : null;
    const choice =
      (await this.keptSegmentModel(input)) ??
      (await this.modelPreference.chooseTurnModel(input.execution, {
        ...(input.model ? { explicit: input.model } : {}),
        pinned,
      }));
    if (choice.kind === MODEL_CHOICE.UNAVAILABLE) {
      this.logger.warn({
        event: 'ai.model.unavailable',
        userId,
        tier: input.execution.tier,
        reason: choice.reason,
        model: input.model ?? pinned,
      });
      callbacks.onError(
        AIErrors.modelUnavailable(choice.reason, choice.suggestedModel)
      );
      return null;
    }
    if (choice.resolution.fallback) {
      this.logger.warn({
        event: 'ai.model.fallback',
        userId,
        tier: input.execution.tier,
        ...choice.resolution.fallback,
      });
    }
    return { model: choice.model, resolution: choice.resolution };
  }

  private async keptSegmentModel(
    input: TurnInput
  ): Promise<ModelChoice | null> {
    if (input.model || !input.cappedSegmentModel) {
      return null;
    }
    const choice = await this.modelPreference.chooseTurnModel(input.execution, {
      pinned: input.cappedSegmentModel,
    });
    const dropped =
      choice.kind === MODEL_CHOICE.UNAVAILABLE
        ? choice.reason
        : choice.resolution.fallback?.reason;
    if (dropped === undefined) {
      return choice;
    }
    this.logger.warn({
      event: 'agent.continuation.model_dropped',
      userId: input.execution.subject.userId,
      tier: input.execution.tier,
      model: input.cappedSegmentModel,
      reason: dropped,
    });
    return null;
  }

  private async persistRequestedModel(
    input: TurnInput,
    persistence: PersistenceContext | undefined
  ): Promise<boolean> {
    if (!input.model || !persistence) {
      return true;
    }
    const { userId } = input.execution.subject;
    try {
      await this.conversations.setModel(
        persistence.conversationId,
        userId,
        input.model
      );
      return true;
    } catch (error) {
      this.logger.error({
        event: 'agent.model_resolution_failed',
        userId,
        error: reasonOf(error),
      });
      return false;
    }
  }

  private async recordUsageSafe(
    ctx: TurnLoopContext,
    usage: AgentTurnUsage
  ): Promise<void> {
    if (usage.inputTokens + usage.outputTokens === 0) {
      await this.rateLimit.releaseReservation(ctx.execution, ctx.reservation);
      return;
    }
    try {
      await this.recordUsage(ctx, usage);
    } catch (error) {
      this.logger.warn({
        event: 'agent.usage.record_failed',
        userId: ctx.execution.subject.userId,
        error: reasonOf(error),
      });
    }
  }

  private async recordUsage(
    ctx: TurnLoopContext,
    usage: AgentTurnUsage
  ): Promise<number> {
    const pricing = this.modelCatalog.getPricing(usage.model);
    const tokenUsage = TokenUsage.create(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: usage.model,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      },
      pricing
    );
    await this.rateLimit.recordUsage(ctx.execution, ctx.reservation, {
      action: 'agent',
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: tokenUsage.costUsd,
    });
    return tokenUsage.costUsd;
  }

  // Fit before guarding: dropping a turn's tool rows can leave its request
  // beside the fresh one, and each drop can expose another such request.
  // Resume has no fresh message to merge with, so it guards one row as before.
  private async fitGuardedHistory(
    history: readonly AgentMessage[],
    fresh: AgentMessage | undefined,
    execution: AiExecutionContext,
    budget: number
  ): Promise<{
    messages: AgentMessage[];
    detections: ReplayDetection[];
    dropped?: DroppedUserTurn;
  }> {
    const withFresh = (messages: readonly AgentMessage[]) =>
      fresh ? [...messages, fresh] : [...messages];
    let replay = history;
    let firstDrop: DroppedUserTurn | undefined;
    for (;;) {
      const fitted = fitHistoryToBudget(withFresh(replay), budget);
      const guarded = await this.guardReplayedUserTurn(
        fresh ? fitted.slice(0, -1) : fitted,
        fresh,
        execution
      );
      firstDrop ??= guarded.dropped;
      if (guarded.dropped && fresh) {
        replay = guarded.messages;
        continue;
      }
      const settled = guarded.dropped
        ? fitHistoryToBudget(guarded.messages, budget)
        : fitted;
      return {
        ...coalesceReplayHistory(settled),
        ...(firstDrop ? { dropped: firstDrop } : {}),
      };
    }
  }

  // The provider is handed consecutive user rows merged into one, so a pair that
  // is individually under the injection threshold can cross it only once joined.
  // Only the seam is re-scanned; both halves are already guarded on their own.
  private async guardReplayedUserTurn(
    history: AgentMessage[],
    fresh: AgentMessage | undefined,
    execution: AiExecutionContext
  ): Promise<{ messages: AgentMessage[]; dropped?: DroppedUserTurn }> {
    const last = fresh
      ? history.length - 1
      : history.findLastIndex((m) => m.role === 'user');
    if (history[last]?.role !== 'user') {
      return { messages: history };
    }
    const joined = fresh
      ? `${history[last].content}${COALESCED_MESSAGE_SEPARATOR}${fresh.content}`
      : history[last].content;
    const text = fresh
      ? `${seamTail(history[last].content)}${COALESCED_MESSAGE_SEPARATOR}${seamHead(fresh.content)}`
      : joined;
    const verdict = await this.injectionGuard.guard(text, execution);
    if (verdict.safe) {
      return { messages: history };
    }
    return {
      messages: history.filter((_, index) => index !== last),
      dropped: { score: verdict.score, contentLength: joined.length },
    };
  }

  private estimateTokens(messages: readonly AgentMessage[]): number {
    const historyTokens = messages.reduce(
      (total, m) => total + estimateMessageTokens(m),
      0
    );
    return historyTokens + AGENT_PROMPT_OVERHEAD_TOKENS;
  }
}
