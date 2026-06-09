import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stepCountIs, streamText } from 'ai';
import type { ProviderRegistryProvider } from 'ai';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import { buildProviderRegistry } from '../../../ai/infrastructure/providers/provider-registry';
import type { AgentEvent, AgentSource } from '../../domain/agent-event';
import type {
  AgentOrchestrator,
  AgentResumeContext,
  AgentRunInput,
} from '../../domain/ports/agent-orchestrator.port';
import { ProposedMutation } from '../../domain/proposed-mutation';
import { AGENT_SYSTEM_PROMPT } from './agent-system-prompt';
import { AgentToolsFactory } from './agent-tools.factory';

// Structural subset of ai's DynamicToolResult; avoids depending on a non-stable SDK type.
interface StepToolResult {
  readonly toolName: string;
  readonly output: unknown;
}

export function extractProposal(
  toolResults: readonly { toolName: string; output: unknown }[]
): ProposedMutation | null {
  for (const r of toolResults) {
    const out = r.output;
    if (
      typeof out === 'object' &&
      out !== null &&
      '__proposal' in out &&
      (out as { __proposal: unknown }).__proposal instanceof ProposedMutation
    ) {
      return (out as { __proposal: ProposedMutation }).__proposal;
    }
  }
  return null;
}

function isSourceNote(value: unknown): value is { id: string; title: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string';
}

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
    const sources = new Map<string, AgentSource>();
    let captured: ProposedMutation | null = null;
    let result;
    try {
      result = streamText({
        model: this.registry.languageModel(
          input.model as `${string}:${string}`
        ),
        system: this.buildSystemPrompt(input.noteId, input.resume),
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: input.resume
          ? this.toolsFactory.buildReadOnly(input.userId)
          : this.toolsFactory.build(input.userId),
        stopWhen: stepCountIs(input.maxSteps),
        onStepFinish: ({ toolResults }) => {
          this.collectSources(toolResults, sources);
          const proposal = extractProposal(toolResults);
          if (proposal) {
            captured = proposal;
          }
        },
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
      if (captured) {
        yield { type: 'proposal', proposal: captured };
        return;
      }
      const usage = await result.totalUsage;
      yield {
        type: 'done',
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          model: input.model,
        },
        sources: [...sources.values()],
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

  private buildSystemPrompt(
    noteId?: string,
    resume?: AgentResumeContext
  ): string {
    let prompt = AGENT_SYSTEM_PROMPT;
    if (noteId) {
      prompt += `\n\nThe user is currently viewing the note with id "${noteId}". When they refer to "this note", "the current note", "esta nota", or similar without naming one, call getNote with that id directly instead of searching.`;
    }
    if (resume) {
      prompt += `\n\nA "${resume.toolName}" action was just resolved: ${resume.outcome}. Briefly confirm this to the user in their language. Do not call any tool.`;
    }
    return prompt;
  }

  private collectSources(
    toolResults: readonly StepToolResult[],
    sink: Map<string, AgentSource>
  ): void {
    for (const result of toolResults) {
      if (result.toolName !== 'getNote' || !isSourceNote(result.output)) {
        continue;
      }
      const { id, title } = result.output;
      if (!sink.has(id)) {
        sink.set(id, { id, title });
      }
    }
  }

  private toError(error: unknown) {
    return AIErrors.providerError(
      error instanceof Error ? error.message : 'Agent run failed'
    );
  }
}
