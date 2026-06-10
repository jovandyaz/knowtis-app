import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.config';
import { AIConfigService } from '../../ai/application/services/ai-config.service';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { getModelPricing } from '../../ai/domain/constants/model-pricing';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
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

const CHARS_PER_TOKEN = 4;

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
    private readonly pendingStore: PendingMutationStore
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
        return 'continue';
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
    const endTurn = (ctx: TurnLoopContext): TurnEventOutcome => {
      callbacks.onDone({
        inputTokens: 0,
        outputTokens: 0,
        model: ctx.model,
        costUsd: 0,
        sources: [],
        knownNotes: [],
      });
      return 'stop';
    };
    return this.runLoop(input, input.resume, callbacks, signal, {
      onProposal: async (_event, ctx) => endTurn(ctx),
      onCommitted: endTurn,
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
    const estimatedTokens = this.estimateTokens(input.messages);
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
    const maxSteps = this.configService.get('AI_AGENT_MAX_STEPS');
    const ctx: TurnLoopContext = { estimatedTokens, model };

    try {
      for await (const event of this.orchestrator.run({
        userId: input.userId,
        messages: input.messages,
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
            callbacks.onError(event.error);
            return;
          case 'done': {
            const costUsd = await this.recordUsage(
              input.userId,
              estimatedTokens,
              event.usage
            );
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

  private async recordUsage(
    userId: string,
    estimatedTokens: number,
    usage: AgentTurnUsage
  ): Promise<number> {
    const tokenUsage = TokenUsage.create(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: usage.model,
      },
      getModelPricing(usage.model)
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

  private toolNameForKind(kind: MutationKind): string {
    return kind === 'create'
      ? 'proposeCreateNote'
      : kind === 'update'
        ? 'proposeUpdateNote'
        : 'proposeShareNote';
  }

  private estimateTokens(messages: readonly AgentMessage[]): number {
    const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN));
  }
}
