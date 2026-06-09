import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.config';
import { AIConfigService } from '../../ai/application/services/ai-config.service';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { getModelPricing } from '../../ai/domain/constants/model-pricing';
import { AIErrors } from '../../ai/domain/errors/ai.errors';
import { TokenUsage } from '../../ai/domain/value-objects/token-usage.vo';
import type { AgentSource } from '../domain/agent-event';
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
}

export interface RunAgentTurnCallbacks {
  readonly onChunk: (text: string) => void;
  readonly onDone: (usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    costUsd: number;
    sources: readonly AgentSource[];
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
  readonly onProposal: (proposal: ProposedMutation) => void;
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

    let lastError: { code: string; message: string } | null = null;
    try {
      for await (const event of this.orchestrator.run({
        userId: input.userId,
        messages: input.messages,
        model,
        maxSteps,
        ...(input.noteId ? { noteId: input.noteId } : {}),
        ...(signal ? { signal } : {}),
      })) {
        switch (event.type) {
          case 'chunk':
            callbacks.onChunk(event.text);
            break;
          case 'error':
            lastError = event.error;
            callbacks.onError(event.error);
            break;
          case 'done': {
            const usage = TokenUsage.create(
              {
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                model: event.usage.model,
              },
              getModelPricing(event.usage.model)
            );
            await this.rateLimit.recordUsage({
              userId: input.userId,
              action: 'agent',
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              model: event.usage.model,
              costUsd: usage.costUsd,
              estimatedTokens,
            });
            callbacks.onDone({
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              model: event.usage.model,
              costUsd: usage.costUsd,
              sources: event.sources,
            });
            break;
          }
          case 'proposal':
            await this.pendingStore.save({
              userId: input.userId,
              mutation: event.proposal,
              toolName: this.toolNameForKind(event.proposal.kind),
            });
            callbacks.onProposal(event.proposal);
            break;
          case 'committed':
            break;
          default: {
            const _exhaustive: never = event;
            throw new Error(`Unhandled agent event: ${String(_exhaustive)}`);
          }
        }
      }
    } catch (error) {
      if (lastError) {
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

  async resumeTurn(
    input: RunAgentTurnInput & {
      resume: { toolName: string; outcome: string };
    },
    callbacks: Pick<RunAgentTurnCallbacks, 'onChunk' | 'onDone' | 'onError'>,
    signal?: AbortSignal
  ): Promise<void> {
    const model = await this.aiConfig.getDefaultModel();
    const maxSteps = this.configService.get('AI_AGENT_MAX_STEPS');
    for await (const event of this.orchestrator.run({
      userId: input.userId,
      messages: input.messages,
      model,
      maxSteps,
      ...(input.noteId ? { noteId: input.noteId } : {}),
      ...(signal ? { signal } : {}),
      resume: input.resume,
    })) {
      if (event.type === 'chunk') {
        callbacks.onChunk(event.text);
      } else if (event.type === 'error') {
        callbacks.onError(event.error);
      } else if (event.type === 'done') {
        callbacks.onDone({
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          model: event.usage.model,
          costUsd: 0,
          sources: event.sources,
        });
      }
    }
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
