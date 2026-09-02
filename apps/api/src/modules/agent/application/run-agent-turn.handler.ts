import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  computeTokenCostUsd,
  detectPromptInjection,
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import {
  AGENT_STOP_REASON,
  FEATURE_FLAG_KEYS,
  type AgentStopReason,
  type ByokProvider,
  type MessageStopReason,
  type ReasoningEffort,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../config/env.config';
import { AIConfigService } from '../../ai/application/services/ai-config.service';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { ByokService } from '../../ai/application/services/byok.service';
import { ModelPreferenceService } from '../../ai/application/services/model-preference.service';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
import {
  clampEffort,
  type EffortAudience,
} from '../../ai/domain/model-catalog/effort-policy';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../ai/domain/ports/embedding.port';
import { AIModel } from '../../ai/domain/value-objects/ai-model.vo';
import { TokenUsage } from '../../ai/domain/value-objects/token-usage.vo';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import type {
  AgentSource,
  AgentTurnUsage,
  WebSource,
} from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
import { coalesceMessages } from '../domain/coalesce-messages';
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
import type {
  MutationKind,
  ProposedMutation,
} from '../domain/proposed-mutation';
import { pruneTranscript } from '../domain/prune-transcript';
import { buildTurnRows } from '../domain/turn-transcript';
import { InjectionGuardService } from './injection-guard.service';

interface RunAgentTurnInput {
  readonly userId: string;
  readonly messages?: readonly AgentMessage[];
  readonly isAnonymous?: boolean;
  readonly clientIp?: string;
  readonly noteId?: string;
  readonly knownNotes?: readonly AgentSource[];
  readonly message?: { content: string };
  readonly conversationId?: string;
  readonly userMemories?: readonly string[];
  readonly model?: string;
  readonly conversationModel?: string | null;
  readonly effort?: ReasoningEffort;
}

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
    conversationId?: string;
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
  readonly onProposal: (proposal: ProposedMutation) => void;
}

type TurnEventOutcome = 'continue' | 'stop';

interface TurnLoopContext {
  readonly estimatedTokens: number;
  readonly estimatedCostUsd: number;
  readonly model: string;
  readonly isByok: boolean;
  readonly reservedIpSubject?: string;
  reconciled: boolean;
}

interface PersistenceContext {
  readonly conversationId: string;
  readonly turnId: string;
  readonly userContent?: string;
}

const CONVERSATION_TITLE_MAX = 120;

interface TurnLoopPolicy {
  readonly onProposal: (
    event: { proposal: ProposedMutation; usage: AgentTurnUsage },
    ctx: TurnLoopContext
  ) => Promise<TurnEventOutcome>;
}

const AGENT_PROMPT_OVERHEAD_TOKENS = 1500;
const AGENT_HISTORY_TOKEN_BUDGET = 12_000;
const AGENT_HISTORY_TOOL_TURNS = 2;
const MAX_USER_MESSAGE_CHARS = 50_000;

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
    private readonly featureFlags: FeatureFlagsService,
    private readonly modelPreference: ModelPreferenceService,
    private readonly byok: ByokService,
    private readonly injectionGuard: InjectionGuardService,
    private readonly aiConfig: AIConfigService
  ) {}

  async execute(
    input: RunAgentTurnInput,
    callbacks: RunAgentTurnCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    if (!input.message) {
      callbacks.onError({
        code: 'validation_error',
        message: 'message is required',
      });
      return;
    }
    // Reject before resolveConversation so a rejected turn leaves no row behind.
    if (input.effort && input.isAnonymous) {
      callbacks.onError(
        AIErrors.validationError('effort is not available on anonymous turns')
      );
      return;
    }
    return this.executeWithMemory(input, callbacks, signal);
  }

  private executePolicy(
    userId: string,
    callbacks: RunAgentTurnCallbacks,
    conversationId?: string
  ): TurnLoopPolicy {
    return {
      onProposal: async (event, ctx) => {
        await this.recordUsage(userId, ctx, event.usage);
        ctx.reconciled = true;
        await this.pendingStore.save({
          userId,
          mutation: event.proposal,
          toolName: this.toolNameForKind(event.proposal.kind),
          ...(conversationId ? { conversationId } : {}),
        });
        callbacks.onProposal(event.proposal);
        return 'stop';
      },
    };
  }

  private async executeWithMemory(
    input: RunAgentTurnInput,
    callbacks: RunAgentTurnCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const message = input.message;
    if (!message) {
      return;
    }
    const conversation = await this.resolveConversation(input, message);
    if (!conversation) {
      callbacks.onError({
        code: 'forbidden',
        message: 'Conversation not found',
      });
      return;
    }
    const conversationId = conversation.id;
    const { history, knownNotes } =
      await this.loadConversationContext(conversationId);
    const messages = coalesceMessages([
      ...history,
      { role: 'user', content: message.content },
    ]);
    const userMemories = await this.loadUserMemories(
      input.userId,
      input.isAnonymous,
      message.content
    );
    const synthInput: RunAgentTurnInput = {
      userId: input.userId,
      messages,
      ...(input.isAnonymous ? { isAnonymous: true } : {}),
      ...(input.clientIp ? { clientIp: input.clientIp } : {}),
      ...(input.noteId ? { noteId: input.noteId } : {}),
      knownNotes,
      ...(userMemories.length ? { userMemories } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      conversationModel: conversation.model,
    };
    return this.runLoop(
      synthInput,
      undefined,
      callbacks,
      signal,
      this.executePolicy(input.userId, callbacks, conversationId),
      {
        conversationId,
        turnId: randomUUID(),
        userContent: message.content,
      }
    );
  }

  private async loadUserMemories(
    userId: string,
    isAnonymous: boolean | undefined,
    latestUserContent: string
  ): Promise<string[]> {
    if (isAnonymous) {
      return [];
    }
    // The turn-level length/injection guards in runLoop run after this; bail
    // early so oversized or injected input never reaches the paid embed call.
    if (
      latestUserContent.length > MAX_USER_MESSAGE_CHARS ||
      !detectPromptInjection(latestUserContent).safe
    ) {
      return [];
    }
    try {
      if (
        !(await this.featureFlags.isEnabled(
          FEATURE_FLAG_KEYS.AGENT_LONGTERM_MEMORY
        ))
      ) {
        return [];
      }
      const k = this.configService.get('AI_MEMORY_RETRIEVAL_K');
      const min = this.configService.get('AI_MEMORY_SIMILARITY_MIN');
      const { vector, costUsd } =
        await this.embed.embedQuery(latestUserContent);
      void this.rateLimit.recordSideCost({
        userId,
        action: 'embedding',
        model: this.configService.get('AI_EMBEDDING_MODEL'),
        costUsd,
        byokTurn: false,
      });
      const matches = await this.memory.searchForUser(userId, vector, k);
      return matches.filter((m) => m.score >= min).map((m) => m.content);
    } catch (error) {
      this.logger.warn(
        'Long-term memory retrieval failed; proceeding without it',
        error instanceof Error ? error.stack : String(error)
      );
      return [];
    }
  }

  private async resolveConversation(
    input: RunAgentTurnInput,
    message: { content: string }
  ): Promise<{ id: string; model: string | null } | null> {
    if (input.conversationId) {
      return this.conversations.findByIdForUser(
        input.conversationId,
        input.userId
      );
    }
    const created = await this.conversations.create({
      userId: input.userId,
      ...(input.noteId ? { noteId: input.noteId } : {}),
      title: [...message.content].slice(0, CONVERSATION_TITLE_MAX).join(''),
    });
    return { id: created.id, model: null };
  }

  private async loadConversationContext(
    conversationId: string
  ): Promise<{ history: AgentMessage[]; knownNotes: AgentSource[] }> {
    const limit = this.configService.get('AI_AGENT_HISTORY_LIMIT');
    const rows = await this.conversations.loadMessages(conversationId, limit);
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
      await this.conversations.appendTurn({
        conversationId: persistence.conversationId,
        turnId: persistence.turnId,
        messages,
      });
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
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private resumePolicy(
    userId: string,
    callbacks: Pick<
      RunAgentTurnCallbacks,
      'onChunk' | 'onDone' | 'onError' | 'onThinking'
    >
  ): TurnLoopPolicy {
    return {
      onProposal: async (event, ctx) => {
        this.logger.warn({
          event: 'agent.resume.proposal_dropped',
          userId,
          proposalId: event.proposal.id,
          summary: event.proposal.summary,
        });
        const costUsd = await this.recordUsage(userId, ctx, event.usage);
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
        });
        return 'stop';
      },
    };
  }

  async resumeTurn(
    input: RunAgentTurnInput & {
      resume: { toolName: string; outcome: string };
    },
    callbacks: Pick<
      RunAgentTurnCallbacks,
      'onChunk' | 'onDone' | 'onError' | 'onThinking'
    >,
    signal?: AbortSignal
  ): Promise<void> {
    if (input.conversationId) {
      const found = await this.conversations.findByIdForUser(
        input.conversationId,
        input.userId
      );
      if (!found) {
        callbacks.onError({
          code: 'forbidden',
          message: 'Conversation not found',
        });
        return;
      }
      const { history, knownNotes } = await this.loadConversationContext(
        input.conversationId
      );
      // Embed the user's last real message, not the tool-confirmation outcome, for memory retrieval.
      const latestUserContent =
        history.findLast((m) => m.role === 'user')?.content ?? '';
      const userMemories = latestUserContent
        ? await this.loadUserMemories(
            input.userId,
            input.isAnonymous,
            latestUserContent
          )
        : [];
      const synthInput: RunAgentTurnInput & {
        resume: { toolName: string; outcome: string };
      } = {
        userId: input.userId,
        messages: coalesceMessages(history),
        knownNotes,
        ...(input.isAnonymous ? { isAnonymous: true } : {}),
        ...(input.clientIp ? { clientIp: input.clientIp } : {}),
        ...(input.noteId ? { noteId: input.noteId } : {}),
        ...(userMemories.length ? { userMemories } : {}),
        conversationModel: found.model,
        resume: input.resume,
      };
      return this.runLoop(
        synthInput,
        input.resume,
        callbacks,
        signal,
        this.resumePolicy(input.userId, callbacks),
        { conversationId: input.conversationId, turnId: randomUUID() }
      );
    }
    callbacks.onError({ code: 'forbidden', message: 'Conversation not found' });
  }

  private async runLoop(
    input: RunAgentTurnInput,
    resume: { toolName: string; outcome: string } | undefined,
    callbacks: Pick<
      RunAgentTurnCallbacks,
      'onChunk' | 'onDone' | 'onError' | 'onThinking'
    >,
    signal: AbortSignal | undefined,
    policy: TurnLoopPolicy,
    persistence: PersistenceContext | undefined
  ): Promise<void> {
    if (signal?.aborted) {
      return;
    }
    const inputMessages = input.messages ?? [];
    const lastUserMessage = inputMessages.findLast((m) => m.role === 'user');
    if (lastUserMessage) {
      if (lastUserMessage.content.length > MAX_USER_MESSAGE_CHARS) {
        callbacks.onError(
          AIErrors.invalidInput(
            `Message exceeds the maximum length of ${MAX_USER_MESSAGE_CHARS} characters`
          )
        );
        return;
      }
      const verdict = await this.injectionGuard.guard(
        lastUserMessage.content,
        input.userId
      );
      if (!verdict.safe) {
        callbacks.onError(AIErrors.promptInjectionDetected());
        return;
      }
    }
    // Unsafe older messages are dropped instead of failing the turn: the
    // client keeps rejected messages in its history, so a hard error here
    // would permanently block the rest of the conversation.
    const messages = this.trimHistory(
      inputMessages.filter(
        (m) =>
          m.role !== 'user' ||
          m === lastUserMessage ||
          this.isSafeHistoryMessage(m, input.userId)
      )
    );
    const estimatedTokens = this.estimateTokens(messages);

    // Resolve the model and the BYOK key BEFORE the budget gate: a BYOK turn
    // bills the user's own key, so it must skip the daily token/cost ceiling.
    let byokProviders: ReadonlySet<string>;
    try {
      byokProviders = await this.modelPreference.byokProvidersFor(
        input.userId,
        input.isAnonymous
      );
    } catch (error) {
      this.logger.warn({
        event: 'agent.byok.providers_lookup_failed',
        userId: input.userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      callbacks.onError(AIErrors.providerError('Model resolution failed'));
      return;
    }

    const tierGatingOn = await this.modelPreference.tierGatingOn();

    let model: string | null;
    try {
      model = await this.resolveModel(
        input,
        persistence?.conversationId,
        callbacks,
        byokProviders,
        tierGatingOn,
        Boolean(resume)
      );
    } catch (error) {
      this.logger.error({
        event: 'agent.model_resolution_failed',
        userId: input.userId,
        error: error instanceof Error ? error.message : 'unknown',
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

    const pricing = this.modelCatalog.getPricing(model);
    const estimatedCostUsd = pricing
      ? computeTokenCostUsd(
          { inputTokens: estimatedTokens, outputTokens: 0 },
          pricing
        )
      : 0;

    const provider = providerOf(model);
    const shouldUseByok = byokProviders.has(provider);
    let byokApiKey: string | null = null;
    if (shouldUseByok) {
      byokApiKey = await this.byok.getApiKey(
        input.userId,
        provider as ByokProvider
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
    const isByok = shouldUseByok;

    // Resolve turn settings BEFORE reserving quota: a settings-store failure
    // must escape before any reservation exists, else the held reservation
    // leaks with no client-facing error (the gateway turn slot has no catch).
    const maxSteps = this.configService.get('AI_AGENT_MAX_STEPS');
    const maxTurnTokens = this.rateLimit.turnTokenBudget(
      input.isAnonymous ?? false
    );
    const [reasoningEffort, openrouterProviderOrder] = await Promise.all([
      this.resolveReasoningEffort(input, model, isByok),
      this.aiConfig.getOpenRouterProviderOrder(),
    ]);

    const limit = await this.rateLimit.checkLimit(
      input.userId,
      estimatedTokens,
      input.isAnonymous ?? false,
      isByok,
      estimatedCostUsd,
      input.clientIp
    );
    if (!limit.allowed) {
      callbacks.onError(AIErrors.rateLimitExceeded(limit.reason));
      return;
    }

    const ctx: TurnLoopContext = {
      estimatedTokens,
      estimatedCostUsd,
      model,
      isByok,
      reconciled: false,
      ...(limit.reservedIpSubject
        ? { reservedIpSubject: limit.reservedIpSubject }
        : {}),
    };

    const turnMessages: AgentMessage[] = [];
    let assistantText = '';
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
    try {
      for await (const event of this.orchestrator.run({
        userId: input.userId,
        messages,
        model,
        maxSteps,
        maxTurnTokens,
        reasoningEffort,
        openrouterProviderOrder,
        ...(input.noteId ? { noteId: input.noteId } : {}),
        ...(input.knownNotes ? { knownNotes: input.knownNotes } : {}),
        ...(input.userMemories?.length
          ? { userMemories: input.userMemories }
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
            callbacks.onChunk(event.text);
            break;
          case 'error':
            await this.recordUsageSafe(
              input.userId,
              ctx,
              event.usage ?? { inputTokens: 0, outputTokens: 0, model }
            );
            ctx.reconciled = true;
            await persistTurnOnce([], 'error');
            callbacks.onError(event.error);
            return;
          case 'aborted':
            await this.recordUsageSafe(input.userId, ctx, event.usage);
            ctx.reconciled = true;
            await persistTurnOnce([], 'aborted');
            return;
          case 'done': {
            let costUsd: number;
            try {
              costUsd = await this.recordUsage(input.userId, ctx, event.usage);
              ctx.reconciled = true;
            } catch (error) {
              this.logger.warn({
                event: 'agent.usage.record_failed',
                userId: input.userId,
                error: error instanceof Error ? error.message : 'unknown',
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
            if (isByok) {
              void this.byok.markUsed(input.userId, provider as ByokProvider);
            }
            await persistTurnOnce(event.sources, event.stopReason);
            callbacks.onDone({
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              model: event.usage.model,
              costUsd,
              sources: event.sources,
              knownNotes: event.knownNotes,
              webSources: event.webSources,
              stopReason: event.stopReason,
              ...(persistence
                ? { conversationId: persistence.conversationId }
                : {}),
            });
            return;
          }
          case 'proposal':
            // Proposal events carry no sources; the post-approval turn re-derives them.
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
        userId: input.userId,
      });
      if (!ctx.reconciled) {
        await this.recordUsageSafe(input.userId, ctx, {
          inputTokens: 0,
          outputTokens: 0,
          model: ctx.model,
        });
      }
      await persistTurnOnce([], 'error');
      callbacks.onError(
        AIErrors.providerError('Agent turn ended without a terminal event')
      );
    } catch (error) {
      await persistTurnOnce([], signal?.aborted ? 'aborted' : 'error');
      if (signal?.aborted) {
        if (!ctx.reconciled) {
          await this.recordUsageSafe(input.userId, ctx, {
            inputTokens: 0,
            outputTokens: 0,
            model: ctx.model,
          });
        }
        return;
      }
      this.logger.error({
        event: 'agent.turn.unexpected_error',
        userId: input.userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      if (!ctx.reconciled) {
        await this.recordUsageSafe(input.userId, ctx, {
          inputTokens: 0,
          outputTokens: 0,
          model: ctx.model,
        });
      }
      callbacks.onError(AIErrors.providerError('Agent turn failed'));
    }
  }

  /** A rejected effort request falls back to the global default with a structured warn — never a silent mismatch. */
  private async resolveReasoningEffort(
    input: RunAgentTurnInput,
    model: string,
    isByok: boolean
  ): Promise<ReasoningEffort> {
    if (!input.effort) {
      return this.aiConfig.getReasoningEffort();
    }
    const audience: Exclude<EffortAudience, 'anonymous'> = isByok
      ? 'byok'
      : 'free';
    const declared = await this.modelPreference.reasoningFor(
      model,
      input.userId
    );
    const clamped = clampEffort(input.effort, declared, audience);
    if (clamped === null) {
      this.logger.warn({
        event: 'agent.effort_fallback',
        model,
        requested: input.effort,
      });
      return this.aiConfig.getReasoningEffort();
    }
    return clamped;
  }

  private async resolveModel(
    input: RunAgentTurnInput,
    conversationId: string | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>,
    byokProviders: ReadonlySet<string>,
    tierGatingOn: boolean,
    resuming: boolean
  ): Promise<string | null> {
    if (input.model) {
      if (
        !(await this.modelPreference.isSelectableWith(
          input.model,
          byokProviders,
          tierGatingOn
        ))
      ) {
        this.logger.warn({
          event: 'ai.model.access_denied',
          model: input.model,
          userId: input.userId,
        });
        callbacks.onError(AIErrors.invalidModel(input.model));
        return null;
      }
      if (conversationId) {
        await this.conversations.setModel(
          conversationId,
          input.userId,
          input.model
        );
      }
      return input.model;
    }
    const stored = input.conversationModel ?? null;
    // On HITL resume this is the only carrier of the model that served the first half of the turn.
    if (
      stored &&
      resuming &&
      (await this.modelPreference.isSelectableWith(
        stored,
        byokProviders,
        tierGatingOn
      ))
    ) {
      return stored;
    }
    return this.modelPreference.getEffectiveDefault(
      input.userId,
      byokProviders,
      tierGatingOn
    );
  }

  private async recordUsageSafe(
    userId: string,
    ctx: TurnLoopContext,
    usage: AgentTurnUsage
  ): Promise<void> {
    if (usage.inputTokens + usage.outputTokens === 0) {
      if (!ctx.isByok) {
        await this.rateLimit.releaseReservation(
          userId,
          ctx.estimatedTokens,
          ctx.estimatedCostUsd,
          ctx.reservedIpSubject
        );
      }
      return;
    }
    try {
      await this.recordUsage(userId, ctx, usage);
    } catch (error) {
      this.logger.warn({
        event: 'agent.usage.record_failed',
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private async recordUsage(
    userId: string,
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
    await this.rateLimit.recordUsage({
      userId,
      action: 'agent',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      model: usage.model,
      costUsd: tokenUsage.costUsd,
      estimatedTokens: ctx.estimatedTokens,
      estimatedCostUsd: ctx.estimatedCostUsd,
      byok: ctx.isByok,
      ...(ctx.reservedIpSubject
        ? { reservedIpSubject: ctx.reservedIpSubject }
        : {}),
    });
    return tokenUsage.costUsd;
  }

  private isSafeHistoryMessage(message: AgentMessage, userId: string): boolean {
    const safe =
      message.content.length <= MAX_USER_MESSAGE_CHARS &&
      detectPromptInjection(message.content).safe;
    if (!safe) {
      this.logger.warn({
        event: 'agent.history.message_dropped',
        userId,
        contentLength: message.content.length,
      });
    }
    return safe;
  }

  private toolNameForKind(kind: MutationKind): string {
    return kind === 'create'
      ? 'proposeCreateNote'
      : kind === 'update'
        ? 'proposeUpdateNote'
        : 'proposeShareNote';
  }

  private trimHistory(
    messages: readonly AgentMessage[]
  ): readonly AgentMessage[] {
    const kept: AgentMessage[] = [];
    let usedTokens = 0;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const tokens = estimateMessageTokens(messages[i]);
      if (kept.length > 0 && usedTokens + tokens > AGENT_HISTORY_TOKEN_BUDGET) {
        break;
      }
      kept.unshift(messages[i]);
      usedTokens += tokens;
    }
    // An empty history is safer than an invalid one, because the provider
    // refuses a tool_result that has no preceding tool_use.
    while (kept.length > 0 && kept[0].role !== 'user') {
      kept.shift();
    }
    return kept;
  }

  private estimateTokens(messages: readonly AgentMessage[]): number {
    const historyTokens = messages.reduce(
      (total, m) => total + estimateMessageTokens(m),
      0
    );
    return historyTokens + AGENT_PROMPT_OVERHEAD_TOKENS;
  }
}
