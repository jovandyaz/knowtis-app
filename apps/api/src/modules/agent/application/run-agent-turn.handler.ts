import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  detectPromptInjection,
  estimateTokenCount,
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import { FEATURE_FLAG_KEYS, type ByokProvider } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../config/env.config';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { ByokService } from '../../ai/application/services/byok.service';
import { ModelPreferenceService } from '../../ai/application/services/model-preference.service';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
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

interface RunAgentTurnInput {
  readonly userId: string;
  readonly messages?: readonly AgentMessage[];
  readonly isAnonymous?: boolean;
  readonly noteId?: string;
  readonly knownNotes?: readonly AgentSource[];
  readonly message?: { content: string };
  readonly conversationId?: string;
  readonly userMemories?: readonly string[];
  readonly model?: string;
  readonly conversationModel?: string | null;
}

export interface RunAgentTurnCallbacks {
  readonly onChunk: (text: string) => void;
  readonly onDone: (usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    costUsd: number;
    sources: readonly AgentSource[];
    knownNotes: readonly AgentSource[];
    webSources: readonly WebSource[];
    conversationId?: string;
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
  readonly onProposal: (proposal: ProposedMutation) => void;
}

type TurnEventOutcome = 'continue' | 'stop';

interface TurnLoopContext {
  readonly estimatedTokens: number;
  readonly model: string;
  readonly isByok: boolean;
}

interface PersistenceContext {
  readonly conversationId: string;
  readonly userContent?: string;
}

const CONVERSATION_TITLE_MAX = 120;

interface TurnLoopPolicy {
  readonly onProposal: (
    event: { proposal: ProposedMutation; usage: AgentTurnUsage },
    ctx: TurnLoopContext
  ) => Promise<TurnEventOutcome>;
  readonly onCommitted: (ctx: TurnLoopContext) => TurnEventOutcome;
}

const AGENT_PROMPT_OVERHEAD_TOKENS = 1500;
const AGENT_HISTORY_TOKEN_BUDGET = 12_000;
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
    private readonly byok: ByokService
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
    return this.executeWithMemory(input, callbacks, signal);
  }

  private executePolicy(
    userId: string,
    callbacks: RunAgentTurnCallbacks,
    conversationId?: string
  ): TurnLoopPolicy {
    return {
      onProposal: async (event, ctx) => {
        await this.recordUsage(
          userId,
          ctx.estimatedTokens,
          event.usage,
          ctx.isByok
        );
        await this.pendingStore.save({
          userId,
          mutation: event.proposal,
          toolName: this.toolNameForKind(event.proposal.kind),
          ...(conversationId ? { conversationId } : {}),
        });
        callbacks.onProposal(event.proposal);
        return 'stop';
      },
      onCommitted: () => 'continue',
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
      ...(input.noteId ? { noteId: input.noteId } : {}),
      knownNotes,
      ...(userMemories.length ? { userMemories } : {}),
      ...(input.model ? { model: input.model } : {}),
      conversationModel: conversation.model,
    };
    return this.runLoop(
      synthInput,
      undefined,
      callbacks,
      signal,
      this.executePolicy(input.userId, callbacks, conversationId),
      { conversationId, userContent: message.content }
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
      const embedding = await this.embed.embedQuery(latestUserContent);
      const matches = await this.memory.searchForUser(userId, embedding, k);
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
    const history: AgentMessage[] = rows.map((r) => ({
      role: r.role,
      content: r.content,
    }));
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
    assistantText: string,
    sources: readonly AgentSource[]
  ): Promise<void> {
    try {
      await this.conversations.appendTurn({
        conversationId: persistence.conversationId,
        ...(persistence.userContent !== undefined
          ? { userMessage: { content: persistence.userContent } }
          : {}),
        assistantMessage: { content: assistantText, sources },
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
    callbacks: Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'>
  ): TurnLoopPolicy {
    return {
      onProposal: async (event, ctx) => {
        this.logger.warn({
          event: 'agent.resume.proposal_dropped',
          userId,
          proposalId: event.proposal.id,
          summary: event.proposal.summary,
        });
        const costUsd = await this.recordUsage(
          userId,
          ctx.estimatedTokens,
          event.usage,
          ctx.isByok
        );
        callbacks.onDone({
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          model: event.usage.model,
          costUsd,
          sources: [],
          knownNotes: [],
          webSources: [],
        });
        return 'stop';
      },
      onCommitted: (ctx) => {
        callbacks.onDone({
          inputTokens: 0,
          outputTokens: 0,
          model: ctx.model,
          costUsd: 0,
          sources: [],
          knownNotes: [],
          webSources: [],
        });
        return 'stop';
      },
    };
  }

  async resumeTurn(
    input: RunAgentTurnInput & {
      resume: { toolName: string; outcome: string };
    },
    callbacks: Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'>,
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
        { conversationId: input.conversationId }
      );
    }
    callbacks.onError({ code: 'forbidden', message: 'Conversation not found' });
  }

  private async runLoop(
    input: RunAgentTurnInput,
    resume: { toolName: string; outcome: string } | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'>,
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
      if (!detectPromptInjection(lastUserMessage.content).safe) {
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

    let model: string | null;
    try {
      model = await this.resolveModel(
        input,
        persistence?.conversationId,
        callbacks,
        byokProviders
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

    const limit = await this.rateLimit.checkLimit(
      input.userId,
      estimatedTokens,
      input.isAnonymous ?? false,
      isByok
    );
    if (!limit.allowed) {
      callbacks.onError(AIErrors.rateLimitExceeded(limit.reason));
      return;
    }

    const maxSteps = this.configService.get('AI_AGENT_MAX_STEPS');
    const ctx: TurnLoopContext = { estimatedTokens, model, isByok };

    let assistantText = '';
    try {
      for await (const event of this.orchestrator.run({
        userId: input.userId,
        messages,
        model,
        maxSteps,
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
          case 'chunk':
            assistantText += event.text;
            callbacks.onChunk(event.text);
            break;
          case 'error':
            await this.recordUsageSafe(
              input.userId,
              estimatedTokens,
              event.usage ?? { inputTokens: 0, outputTokens: 0, model },
              isByok
            );
            callbacks.onError(event.error);
            return;
          case 'aborted':
            await this.recordUsageSafe(
              input.userId,
              estimatedTokens,
              event.usage,
              isByok
            );
            return;
          case 'done': {
            let costUsd: number;
            try {
              costUsd = await this.recordUsage(
                input.userId,
                estimatedTokens,
                event.usage,
                isByok
              );
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
                },
                this.modelCatalog.getPricing(event.usage.model)
              ).costUsd;
            }
            if (isByok) {
              void this.byok.markUsed(input.userId, provider as ByokProvider);
            }
            if (persistence) {
              await this.persistTurn(persistence, assistantText, event.sources);
            }
            callbacks.onDone({
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              model: event.usage.model,
              costUsd,
              sources: event.sources,
              knownNotes: event.knownNotes,
              webSources: event.webSources,
              ...(persistence
                ? { conversationId: persistence.conversationId }
                : {}),
            });
            return;
          }
          case 'proposal':
            if (persistence) {
              // Proposal events carry no sources; the post-approval turn re-derives them.
              await this.persistTurn(persistence, assistantText, []);
            }
            if ((await policy.onProposal(event, ctx)) === 'stop') {
              return;
            }
            break;
          case 'committed':
            if (policy.onCommitted(ctx) === 'stop') {
              return;
            }
            break;
          default: {
            const _exhaustive: never = event;
            throw new Error(`Unhandled agent event: ${String(_exhaustive)}`);
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      this.logger.error({
        event: 'agent.turn.unexpected_error',
        userId: input.userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      callbacks.onError(AIErrors.providerError('Agent turn failed'));
    }
  }

  private async resolveModel(
    input: RunAgentTurnInput,
    conversationId: string | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onError'>,
    byokProviders: ReadonlySet<string>
  ): Promise<string | null> {
    if (input.model) {
      if (!this.modelPreference.isSelectableWith(input.model, byokProviders)) {
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
    if (
      stored &&
      this.modelPreference.isSelectableWith(stored, byokProviders)
    ) {
      return stored;
    }
    return this.modelPreference.getEffectiveDefault(
      input.userId,
      byokProviders
    );
  }

  private async recordUsageSafe(
    userId: string,
    estimatedTokens: number,
    usage: AgentTurnUsage,
    isByok = false
  ): Promise<void> {
    if (usage.inputTokens + usage.outputTokens === 0) {
      if (!isByok) {
        await this.rateLimit.releaseReservation(userId, estimatedTokens);
      }
      return;
    }
    try {
      await this.recordUsage(userId, estimatedTokens, usage, isByok);
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
    estimatedTokens: number,
    usage: AgentTurnUsage,
    isByok = false
  ): Promise<number> {
    const pricing = this.modelCatalog.getPricing(usage.model);
    const tokenUsage = TokenUsage.create(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: usage.model,
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
      estimatedTokens,
      byok: isByok,
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
      const tokens = estimateTokenCount(messages[i].content);
      if (kept.length > 0 && usedTokens + tokens > AGENT_HISTORY_TOKEN_BUDGET) {
        break;
      }
      kept.unshift(messages[i]);
      usedTokens += tokens;
    }
    while (kept.length > 1 && kept[0].role !== 'user') {
      kept.shift();
    }
    return kept;
  }

  private estimateTokens(messages: readonly AgentMessage[]): number {
    const text = messages.map((m) => m.content).join('\n');
    return estimateTokenCount(text) + AGENT_PROMPT_OVERHEAD_TOKENS;
  }
}
