import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stepCountIs, streamText } from 'ai';
import type { ProviderRegistryProvider } from 'ai';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import { buildProviderRegistry } from '../../../ai/infrastructure/providers/provider-registry';
import type { AgentEvent } from '../../domain/agent-event';
import type {
  AgentOrchestrator,
  AgentRunInput,
} from '../../domain/ports/agent-orchestrator.port';
import { AGENT_SYSTEM_PROMPT } from './agent-system-prompt';
import { AgentToolsFactory } from './agent-tools.factory';

@Injectable()
export class AiSdkAgentOrchestrator implements AgentOrchestrator, OnModuleInit {
  private readonly logger = new Logger(AiSdkAgentOrchestrator.name);
  private registry!: ProviderRegistryProvider;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly toolsFactory: AgentToolsFactory
  ) {}

  onModuleInit(): void {
    this.registry = buildProviderRegistry({
      googleApiKey:
        this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY') || undefined,
      openaiApiKey: this.configService.get('OPENAI_API_KEY') || undefined,
    });
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    let result;
    try {
      result = streamText({
        model: this.registry.languageModel(
          input.model as `${string}:${string}`
        ),
        system: AGENT_SYSTEM_PROMPT,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: this.toolsFactory.build(input.userId),
        stopWhen: stepCountIs(input.maxSteps),
        ...(input.signal ? { abortSignal: input.signal } : {}),
      });
    } catch (error) {
      yield { type: 'error', error: this.toError(error) };
      return;
    }

    try {
      for await (const delta of result.textStream) {
        if (delta) {
          yield { type: 'chunk', text: delta };
        }
      }
      const usage = await result.totalUsage;
      yield {
        type: 'done',
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          model: input.model,
        },
      };
    } catch (error) {
      if (input.signal?.aborted) {
        return;
      }
      this.logger.error({
        event: 'agent.run.error',
        userId: input.userId,
        model: input.model,
        error: error instanceof Error ? error.message : 'unknown',
      });
      yield { type: 'error', error: this.toError(error) };
    }
  }

  private toError(error: unknown) {
    return AIErrors.providerError(
      error instanceof Error ? error.message : 'Agent run failed'
    );
  }
}
