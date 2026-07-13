import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stepCountIs, streamText } from 'ai';

import {
  isAbortError,
  isOverloadedError,
  streamWithChain,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import { FallbackChainService } from '../../../ai/infrastructure/providers/fallback-chain.service';
import { ProviderRegistryFactory } from '../../../ai/infrastructure/providers/provider-registry.factory';
import { buildRedactedTelemetry } from '../../../ai/infrastructure/providers/redacted-telemetry';
import type {
  AgentEvent,
  AgentSource,
  AgentTurnUsage,
} from '../../domain/agent-event';
import type {
  AgentOrchestrator,
  AgentRunInput,
} from '../../domain/ports/agent-orchestrator.port';
import type { AgentToolContext } from '../tools/agent-tool';
import { AgentToolRegistry } from './agent-tool.registry';
import { composeSystemPrompt } from './compose-system-prompt';
import { ProposalCollector } from './proposal-collector';
import { WebFetchAllowlist } from './web-fetch-allowlist';
import { WebSourceCollector } from './web-source.collector';

interface StepToolResult {
  readonly toolName: string;
  readonly output: unknown;
}

interface StepUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
}

const AGENT_TEMPERATURE = 0.7;

function isSourceNote(value: unknown): value is { id: string; title: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string';
}

@Injectable()
export class AiSdkAgentOrchestrator implements AgentOrchestrator {
  private readonly logger = new Logger(AiSdkAgentOrchestrator.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly toolRegistry: AgentToolRegistry,
    private readonly providerRegistry: ProviderRegistryFactory,
    private readonly fallbackChain: FallbackChainService
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const timeoutSignal = AbortSignal.timeout(
      this.configService.get('AI_AGENT_MAX_MS')
    );
    const abortSignal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    if (input.byokApiKey) {
      // BYOK runs a single turn with the user's key — throwOnFreshFailure:false
      // surfaces a key failure as an error event instead of falling back to a
      // server-billed provider.
      yield* this.runTurn(input, input.model, abortSignal, timeoutSignal, {
        throwOnFreshFailure: false,
      });
      return;
    }

    yield* streamWithChain({
      candidates: this.fallbackChain.candidatesFor(input.model),
      cooldown: this.fallbackChain.cooldown,
      logger: this.logger,
      open: (model, info) =>
        this.runTurn(input, model, abortSignal, timeoutSignal, {
          throwOnFreshFailure: !info.isLast,
        }),
      chunks: (turn) => turn,
      isAborted: () => abortSignal.aborted,
      isFailureChunk: (event) => event.type === 'error',
    });
  }

  private async *runTurn(
    input: AgentRunInput,
    model: string,
    abortSignal: AbortSignal,
    timeoutSignal: AbortSignal,
    options: { throwOnFreshFailure: boolean }
  ): AsyncGenerator<AgentEvent> {
    const sources = new Map<string, AgentSource>();
    const knownNotes = new Map<string, AgentSource>();
    for (const note of input.knownNotes ?? []) {
      knownNotes.set(note.id, note);
    }
    const proposals = new ProposalCollector();
    const webSourceCollector = new WebSourceCollector();
    const webFetchAllowlist = new WebFetchAllowlist();
    const latestUserContent = input.messages.findLast(
      (m) => m.role === 'user'
    )?.content;
    if (latestUserContent) {
      webFetchAllowlist.seedFromText(latestUserContent);
    }
    const toolContext: AgentToolContext = {
      userId: input.userId,
      phase: input.resume ? 'readonly' : 'full',
      proposals,
      webSources: webSourceCollector,
      webFetchAllowlist,
    };
    const tools = await this.toolRegistry.resolve(toolContext);
    const stepUsage: StepUsageAccumulator = { inputTokens: 0, outputTokens: 0 };
    let progressed = false;
    let result;
    try {
      result = streamText({
        model: this.providerRegistry.languageModel(model, input.byokApiKey),
        system: this.buildSystemPrompt(
          input.noteId,
          input.knownNotes,
          input.userMemories
        ),
        messages: input.resume
          ? [
              ...input.messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              {
                role: 'user' as const,
                content: `(Action result — ${input.resume.outcome}) Reply to me briefly in my language to acknowledge this. Do not re-propose or restate the action as a new proposal, and do not call any tool.`,
              },
            ]
          : input.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
        tools,
        stopWhen: stepCountIs(input.maxSteps),
        maxOutputTokens: this.configService.get('AI_AGENT_MAX_OUTPUT_TOKENS'),
        maxRetries: this.configService.get('AI_MAX_RETRIES'),
        temperature: AGENT_TEMPERATURE,
        abortSignal,
        onStepFinish: ({ toolResults, usage }) => {
          progressed = true;
          this.collectSources(toolResults, sources);
          this.collectKnownNotes(toolResults, knownNotes);
          stepUsage.inputTokens += usage?.inputTokens ?? 0;
          stepUsage.outputTokens += usage?.outputTokens ?? 0;
        },
        experimental_telemetry: buildRedactedTelemetry(
          'agent-turn',
          {
            userId: input.userId,
            environment: this.configService.get('NODE_ENV'),
            ...(input.resume ? { tags: ['resume'] } : {}),
          },
          this.configService.get('NODE_ENV') !== 'production' &&
            !input.byokApiKey
        ),
      });
    } catch (error) {
      if (options.throwOnFreshFailure && !isAbortError(error)) {
        throw error;
      }
      yield {
        type: 'error',
        error: this.toError(error, Boolean(input.byokApiKey)),
      };
      return;
    }

    try {
      for await (const delta of result.textStream) {
        if (delta) {
          progressed = true;
          yield { type: 'chunk', text: delta };
        }
      }
      const interrupted = this.interruptionEvent(
        input,
        model,
        timeoutSignal,
        stepUsage
      );
      if (interrupted) {
        yield interrupted;
        return;
      }
      const usage = await result.totalUsage;
      const turnUsage = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        model,
      };
      const captured = proposals.captured;
      if (captured) {
        yield { type: 'proposal', proposal: captured, usage: turnUsage };
        return;
      }
      yield {
        type: 'done',
        usage: turnUsage,
        sources: [...sources.values()],
        knownNotes: [...knownNotes.values()],
        webSources: webSourceCollector.all,
      };
    } catch (error) {
      const interrupted = this.interruptionEvent(
        input,
        model,
        timeoutSignal,
        stepUsage
      );
      if (interrupted) {
        yield interrupted;
        return;
      }
      if (options.throwOnFreshFailure && !progressed && !isAbortError(error)) {
        throw error;
      }
      const redact = Boolean(input.byokApiKey);
      this.logger.error({
        event: 'agent.run.error',
        userId: input.userId,
        model,
        error: this.errorMessage(error, redact),
      });
      yield {
        type: 'error',
        error: this.toError(error, redact),
        usage: this.bestEffortUsage(model, stepUsage),
      };
    }
  }

  // totalUsage never settles on an interrupted stream, so terminal events for
  // abort/timeout must rely on the per-step accumulator instead of awaiting it.
  private interruptionEvent(
    input: AgentRunInput,
    model: string,
    timeoutSignal: AbortSignal,
    stepUsage: StepUsageAccumulator
  ): AgentEvent | undefined {
    if (input.signal?.aborted) {
      return {
        type: 'aborted',
        usage: this.bestEffortUsage(model, stepUsage),
      };
    }
    if (timeoutSignal.aborted) {
      this.logger.warn({
        event: 'agent.turn.timeout',
        userId: input.userId,
        model,
        maxMs: this.configService.get('AI_AGENT_MAX_MS'),
      });
      return {
        type: 'error',
        error: AIErrors.providerError('Agent turn timed out'),
        usage: this.bestEffortUsage(model, stepUsage),
      };
    }
    return undefined;
  }

  private bestEffortUsage(
    model: string,
    stepUsage: StepUsageAccumulator
  ): AgentTurnUsage {
    return {
      inputTokens: stepUsage.inputTokens,
      outputTokens: stepUsage.outputTokens,
      model,
    };
  }

  private buildSystemPrompt(
    noteId?: string,
    knownNotes?: readonly AgentSource[],
    userMemories?: readonly string[]
  ): string {
    return composeSystemPrompt(noteId, knownNotes, userMemories);
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

  private collectKnownNotes(
    toolResults: readonly StepToolResult[],
    sink: Map<string, AgentSource>
  ): void {
    for (const result of toolResults) {
      const output = result.output;
      const items = Array.isArray(output) ? output : [output];
      for (const item of items) {
        if (isSourceNote(item)) {
          sink.set(item.id, { id: item.id, title: item.title });
        }
      }
    }
  }

  private toError(error: unknown, redact = false) {
    if (isOverloadedError(error)) {
      return AIErrors.providerOverloaded();
    }
    return AIErrors.providerError(this.errorMessage(error, redact));
  }

  // Provider/SDK auth errors can echo key material (e.g. OpenAI's "Incorrect
  // API key provided: sk-…"), so a BYOK turn must never surface the raw message.
  private errorMessage(error: unknown, redact: boolean): string {
    if (redact) {
      return 'BYOK provider request failed';
    }
    return error instanceof Error ? error.message : 'Agent run failed';
  }
}
