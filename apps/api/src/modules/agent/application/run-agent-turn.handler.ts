import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  deriveConversationTitle,
  type AgentStopReason,
  type AiQuota,
  type MessageStopReason,
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
import { ByokService } from '../../ai/application/services/byok.service';
import { MessageQuotaService } from '../../ai/application/services/message-quota.service';
import { ModelPreferenceService } from '../../ai/application/services/model-preference.service';
import { TierResolver } from '../../ai/application/services/tier-resolver.service';
import {
  TurnEffortResolver,
  type TurnEffortRequest,
} from '../../ai/application/services/turn-effort.resolver';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
import {
  billingFor,
  type AiExecutionContext,
} from '../../ai/domain/execution-context/ai-execution-context';
import {
  segmentLimits,
  type SegmentLimits,
} from '../../ai/domain/execution-context/segment-policy';
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
  fitHistoryToBudget,
  pruneTranscript,
} from '../domain/prune-transcript';
import {
  coalesceReplayHistory,
  sanitizeReplayHistory,
  type ReplayDetection,
} from '../domain/replay-input-sanitizer';
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

type TurnInput = Omit<
  RunAgentTurnInput,
  'userId' | 'isAnonymous' | 'clientIp'
> & {
  readonly execution: AiExecutionContext;
  /** The text long-term memory is retrieved for; absent when there is none. */
  readonly memoryQuery?: string;
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
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
  readonly onProposal: (proposal: ProposedMutation) => void;
  /** Fires once, when the turn named no conversation, with the one it opened; the id must not wait for `done`. */
  readonly onConversation?: (conversationId: string) => void;
  /** Fires once, just before the model runs; a turn that ends without it was refused before any model call. */
  readonly onModelStart?: () => void;
  /** Fires after the turn draws or gives back one of today's messages. */
  readonly onQuota?: (quota: AiQuota) => void;
}

type TurnEventOutcome = 'continue' | 'stop';

interface TurnLoopContext {
  readonly execution: AiExecutionContext;
  readonly reservation: Reservation;
  readonly model: string;
  reconciled: boolean;
}

interface PersistenceContext {
  readonly conversationId: string;
  readonly turnId: string;
  readonly userContent?: string;
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

type PreparedTurn =
  | { readonly kind: 'refused' }
  | { readonly kind: 'budget_denied'; readonly reason?: string }
  | {
      readonly kind: 'ready';
      readonly messages: AgentMessage[];
      readonly userMemories: string[];
      readonly limits: SegmentLimits;
      readonly openrouterProviderOrder: readonly string[];
      readonly openrouterIgnoredProviders: readonly string[];
      readonly reservation: Reservation;
    };

const AGENT_PROMPT_OVERHEAD_TOKENS = 1500;
export const AGENT_HISTORY_TOKEN_BUDGET = 12_000;
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

function messageTooLongError() {
  return AIErrors.invalidInput(
    `Message exceeds the maximum length of ${MAX_USER_MESSAGE_CHARS} characters`
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
    private readonly quota: MessageQuotaService
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
    if (conversation.opened) {
      callbacks.onConversation?.(conversationId);
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
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      conversationModel: conversation.model,
    };
    const persistence: PersistenceContext = {
      conversationId,
      turnId: input.turnId,
      userContent: message.content,
    };
    return this.runLoop(
      synthInput,
      undefined,
      callbacks,
      signal,
      this.executePolicy(callbacks, persistence),
      persistence
    );
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
  ): Promise<{ id: string; model: string | null; opened: boolean } | null> {
    if (input.conversationId) {
      const existing = await this.conversations.findByIdForUser(
        input.conversationId,
        input.userId
      );
      return existing ? { ...existing, opened: false } : null;
    }
    const id = conversationIdForTurn(input.userId, input.turnId);
    const replayed = await this.conversations.findByIdForUser(id, input.userId);
    if (replayed) {
      return { ...replayed, opened: true };
    }
    const created = await this.conversations.create({
      id,
      userId: input.userId,
      ...(input.noteId ? { noteId: input.noteId } : {}),
      title: deriveConversationTitle(message.content) || null,
    });
    return { id: created.id, model: null, opened: true };
  }

  private async loadConversationContext(
    conversationId: string,
    userId: string
  ): Promise<{ history: AgentMessage[]; knownNotes: AgentSource[] }> {
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
    return { history, knownNotes: [...seen.values()] };
  }

  private async persistTurn(
    persistence: PersistenceContext,
    turnMessages: readonly AgentMessage[],
    assistantText: string,
    sources: readonly AgentSource[],
    stopReason: MessageStopReason
  ): Promise<void> {
    const messages = buildTurnRows({
      userContent: persistence.userContent,
      turnMessages,
      assistantText,
      sources,
      stopReason,
    });
    if (messages.length === 0) {
      return;
    }
    try {
      const persisted = await this.conversations.appendTurn({
        conversationId: persistence.conversationId,
        turnId: persistence.turnId,
        messages,
      });
      if (!persisted) {
        return;
      }
      this.logger.log({
        event: 'agent.conversation.persisted',
        conversationId: persistence.conversationId,
        turnId: persistence.turnId,
        rows: messages.length,
        toolRows: messages.filter((m) => m.role === 'tool').length,
        stopReason,
      });
    } catch (error) {
      this.logger.error({
        event: 'agent.conversation.persist_failed',
        conversationId: persistence.conversationId,
        error: reasonOf(error),
      });
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
    const { history, knownNotes } = await this.loadConversationContext(
      input.conversationId,
      input.userId
    );
    // A resume carries a tool-confirmation outcome, not the user's words, so
    // memory retrieval embeds the last real user message instead.
    const memoryQuery = history.findLast((m) => m.role === 'user')?.content;
    const synthInput: TurnInput & {
      resume: { outcome: string };
    } = {
      turnId: input.turnId,
      messages: history,
      knownNotes,
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
    let model: string | null;
    try {
      model = await this.resolveModel(
        input,
        persistence?.conversationId,
        callbacks,
        Boolean(resume)
      );
    } catch (error) {
      this.logger.error({
        event: 'agent.model_resolution_failed',
        userId,
        error: reasonOf(error),
      });
      callbacks.onError(AIErrors.providerError('Model resolution failed'));
      return;
    }
    if (model === null) {
      return;
    }
    const modelResult = AIModel.create(model, this.modelCatalog);
    if (modelResult.isErr()) {
      callbacks.onError(modelResult.error);
      return;
    }

    const execution = billingFor(input.execution, providerOf(model));
    let byokApiKey: string | null = null;
    if (execution.billing.kind === 'byok') {
      byokApiKey = await this.byok.getApiKey(
        userId,
        execution.billing.provider
      );
      // Fail closed: the model was selectable on the user's key, so never bill
      // the server's key as a silent fallback when that key is unavailable.
      if (!byokApiKey) {
        callbacks.onError(
          AIErrors.providerError(
            'Your saved key for this provider is unavailable. Re-add it in settings.'
          )
        );
        return;
      }
    }

    const freshUserMessage: AgentMessage | undefined =
      resume === undefined && input.message
        ? { role: 'user', content: input.message.content }
        : undefined;
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
    if (prepared.kind === 'refused') {
      return;
    }
    if (prepared.kind === 'budget_denied') {
      await hold.refund();
      callbacks.onError(AIErrors.rateLimitExceeded(prepared.reason));
      return;
    }

    const ctx: TurnLoopContext = {
      execution,
      reservation: prepared.reservation,
      model,
      reconciled: false,
    };

    const turnMessages: AgentMessage[] = [];
    let assistantText = '';
    let answered = false;
    let persisted = false;
    const persistTurnOnce = async (
      sources: readonly AgentSource[],
      stopReason: MessageStopReason
    ): Promise<void> => {
      if (!persistence || persisted) {
        return;
      }
      persisted = true;
      await this.persistTurn(
        persistence,
        turnMessages,
        assistantText,
        sources,
        stopReason
      );
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
            await persistTurnOnce([], 'error');
            if (!answered) {
              await hold.refund();
            }
            callbacks.onError(event.error);
            return;
          case 'aborted':
            await this.recordUsageSafe(ctx, event.usage);
            ctx.reconciled = true;
            await persistTurnOnce([], 'aborted');
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
            await persistTurnOnce(event.sources, event.stopReason);
            const continuable = policy.consumesQuota
              ? isContinuable(event.stopReason, hold.quota())
              : await this.continuableFromSnapshot(
                  event.stopReason,
                  input.execution
                );
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
            });
            return;
          }
          case 'proposal':
            // Empty because proposal events carry no sources; the post-approval
            // turn re-derives them.
            await persistTurnOnce([], AGENT_STOP_REASON.COMPLETED);
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
      await persistTurnOnce([], 'error');
      if (!answered) {
        await hold.refund();
      }
      callbacks.onError(
        AIErrors.providerError('Agent turn ended without a terminal event')
      );
    } catch (error) {
      await persistTurnOnce([], signal?.aborted ? 'aborted' : 'error');
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
        let reported = outcome.quota;
        return {
          refund: async () => {
            if (refunded) {
              return;
            }
            refunded = true;
            const quota = await this.quota.refund(outcome.receipt);
            if (quota) {
              reported = quota;
              this.reportQuota(callbacks, quota, turnId);
            }
          },
          quota: () => reported,
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

  private async prepareTurn(
    input: TurnInput,
    execution: AiExecutionContext,
    model: string,
    freshUserMessage: AgentMessage | undefined,
    persistence: PersistenceContext | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>
  ): Promise<PreparedTurn> {
    const { userId } = execution.subject;
    if (freshUserMessage) {
      const verdict = await this.injectionGuard.guard(
        freshUserMessage.content,
        execution
      );
      if (!verdict.safe) {
        callbacks.onError(AIErrors.promptInjectionDetected());
        return { kind: 'refused' };
      }
    }
    const inputMessages = input.messages ?? [];
    const sanitized = sanitizeReplayHistory(inputMessages);
    const fitted = await this.fitGuardedHistory(
      sanitized.messages,
      freshUserMessage,
      execution
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
    // Resolve turn settings before the budget reservation: a settings-store
    // failure must escape before any reservation exists, else the held
    // reservation leaks with no client-facing error.
    const limits = segmentLimits(execution, {
      maxSteps: this.configService.get('AI_AGENT_MAX_STEPS'),
      byokMaxSteps: this.configService.get('AI_AGENT_BYOK_MAX_STEPS'),
      turnTokenBudget: this.configService.get('AI_AGENT_TURN_TOKEN_BUDGET'),
      dailyTokenAllowance: this.rateLimit.dailyAllowance(execution).tokenLimit,
    });
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
        kind: 'budget_denied',
        ...(limit.reason !== undefined ? { reason: limit.reason } : {}),
      };
    }
    return {
      kind: 'ready',
      messages,
      userMemories,
      limits,
      openrouterProviderOrder,
      openrouterIgnoredProviders,
      reservation: limit.reservation,
    };
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
    conversationId: string | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>,
    resuming: boolean
  ): Promise<string | null> {
    const { byokProviders } = input.execution;
    const { userId } = input.execution.subject;
    if (input.model) {
      if (
        !(await this.modelPreference.isSelectableWith(
          input.model,
          byokProviders
        ))
      ) {
        this.logger.warn({
          event: 'ai.model.access_denied',
          model: input.model,
          userId,
        });
        callbacks.onError(AIErrors.invalidModel(input.model));
        return null;
      }
      if (conversationId) {
        await this.conversations.setModel(conversationId, userId, input.model);
      }
      return input.model;
    }
    const stored = input.conversationModel ?? null;
    // On a HITL resume the stored model is the only record of which model served
    // the first half of the turn, so it wins over the default while selectable.
    if (
      stored &&
      resuming &&
      (await this.modelPreference.isSelectableWith(stored, byokProviders))
    ) {
      return stored;
    }
    return this.modelPreference.getEffectiveDefault(userId, byokProviders);
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
    execution: AiExecutionContext
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
      const fitted = fitHistoryToBudget(
        withFresh(replay),
        AGENT_HISTORY_TOKEN_BUDGET
      );
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
        ? fitHistoryToBudget(guarded.messages, AGENT_HISTORY_TOKEN_BUDGET)
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
