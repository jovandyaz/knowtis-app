import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  detectPromptInjection,
  estimateTokenCount,
  MODEL_CATALOG,
  type ModelCatalog,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../config/env.config';
import { AIConfigService } from '../../ai/application/services/ai-config.service';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
import { AIModel } from '../../ai/domain/value-objects/ai-model.vo';
import { TokenUsage } from '../../ai/domain/value-objects/token-usage.vo';
import type { AgentSource, AgentTurnUsage } from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
import {
  AGENT_ORCHESTRATOR,
  type AgentOrchestrator,
} from '../domain/ports/agent-orchestrator.port';
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
  readonly messages: readonly AgentMessage[];
  readonly isAnonymous?: boolean;
  readonly noteId?: string;
  readonly knownNotes?: readonly AgentSource[];
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
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
  readonly onProposal: (proposal: ProposedMutation) => void;
}

type TurnEventOutcome = 'continue' | 'stop';

interface TurnLoopContext {
  readonly estimatedTokens: number;
  readonly model: string;
}

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
    private readonly aiConfig: AIConfigService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(PENDING_MUTATION_STORE)
    private readonly pendingStore: PendingMutationStore,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog
  ) {}

  async execute(
    input: RunAgentTurnInput,
    callbacks: RunAgentTurnCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    return this.runLoop(input, undefined, callbacks, signal, {
      onProposal: async (event, ctx) => {
        await this.recordUsage(input.userId, ctx.estimatedTokens, event.usage);
        await this.pendingStore.save({
          userId: input.userId,
          mutation: event.proposal,
          toolName: this.toolNameForKind(event.proposal.kind),
        });
        callbacks.onProposal(event.proposal);
        return 'stop';
      },
      onCommitted: () => 'continue',
    });
  }

  async resumeTurn(
    input: RunAgentTurnInput & {
      resume: { toolName: string; outcome: string };
    },
    callbacks: Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'>,
    signal?: AbortSignal
  ): Promise<void> {
    return this.runLoop(input, input.resume, callbacks, signal, {
      onProposal: async (event, ctx) => {
        this.logger.warn({
          event: 'agent.resume.proposal_dropped',
          userId: input.userId,
          proposalId: event.proposal.id,
          summary: event.proposal.summary,
        });
        const costUsd = await this.recordUsage(
          input.userId,
          ctx.estimatedTokens,
          event.usage
        );
        callbacks.onDone({
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          model: event.usage.model,
          costUsd,
          sources: [],
          knownNotes: [],
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
        });
        return 'stop';
      },
    });
  }

  private async runLoop(
    input: RunAgentTurnInput,
    resume: { toolName: string; outcome: string } | undefined,
    callbacks: Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'>,
    signal: AbortSignal | undefined,
    policy: TurnLoopPolicy
  ): Promise<void> {
    if (signal?.aborted) {
      return;
    }
    const lastUserMessage = input.messages.findLast((m) => m.role === 'user');
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
      input.messages.filter(
        (m) =>
          m.role !== 'user' ||
          m === lastUserMessage ||
          this.isSafeHistoryMessage(m, input.userId)
      )
    );
    const estimatedTokens = this.estimateTokens(messages);
    const limit = await this.rateLimit.checkLimit(
      input.userId,
      estimatedTokens,
      input.isAnonymous ?? false
    );
    if (!limit.allowed) {
      callbacks.onError(AIErrors.rateLimitExceeded(limit.reason));
      return;
    }

    const model = await this.aiConfig.getDefaultModel();
    const modelResult = AIModel.create(model, this.modelCatalog);
    if (modelResult.isErr()) {
      await this.rateLimit.releaseReservation(input.userId, estimatedTokens);
      callbacks.onError(modelResult.error);
      return;
    }
    const maxSteps = this.configService.get('AI_AGENT_MAX_STEPS');
    const ctx: TurnLoopContext = { estimatedTokens, model };

    try {
      for await (const event of this.orchestrator.run({
        userId: input.userId,
        messages,
        model,
        maxSteps,
        ...(input.noteId ? { noteId: input.noteId } : {}),
        ...(input.knownNotes ? { knownNotes: input.knownNotes } : {}),
        ...(signal ? { signal } : {}),
        ...(resume ? { resume } : {}),
      })) {
        switch (event.type) {
          case 'chunk':
            callbacks.onChunk(event.text);
            break;
          case 'error':
            await this.recordUsageSafe(
              input.userId,
              estimatedTokens,
              event.usage ?? { inputTokens: 0, outputTokens: 0, model }
            );
            callbacks.onError(event.error);
            return;
          case 'aborted':
            await this.recordUsageSafe(
              input.userId,
              estimatedTokens,
              event.usage
            );
            return;
          case 'done': {
            let costUsd: number;
            try {
              costUsd = await this.recordUsage(
                input.userId,
                estimatedTokens,
                event.usage
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
            callbacks.onDone({
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              model: event.usage.model,
              costUsd,
              sources: event.sources,
              knownNotes: event.knownNotes,
            });
            return;
          }
          case 'proposal':
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
      callbacks.onError(
        AIErrors.providerError(
          error instanceof Error ? error.message : 'Agent turn failed'
        )
      );
    }
  }

  private async recordUsageSafe(
    userId: string,
    estimatedTokens: number,
    usage: AgentTurnUsage
  ): Promise<void> {
    if (usage.inputTokens + usage.outputTokens === 0) {
      await this.rateLimit.releaseReservation(userId, estimatedTokens);
      return;
    }
    try {
      await this.recordUsage(userId, estimatedTokens, usage);
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
    usage: AgentTurnUsage
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
