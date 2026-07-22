import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { stepCountIs, streamText, type ToolSet } from 'ai';

import {
  isAbortError,
  isOverloadedError,
  providerOf,
  streamWithChain,
} from '@knowtis/ai-gateway';
import { FEATURE_FLAG_KEYS, type ReasoningEffort } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import {
  cacheableSystem,
  withLastMessageCache,
} from '../../../ai/infrastructure/providers/anthropic-cache';
import { FallbackChainService } from '../../../ai/infrastructure/providers/fallback-chain.service';
import { ProviderRegistryFactory } from '../../../ai/infrastructure/providers/provider-registry.factory';
import { buildRedactedTelemetry } from '../../../ai/infrastructure/providers/redacted-telemetry';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type {
  AgentEvent,
  AgentSource,
  AgentTurnUsage,
} from '../../domain/agent-event';
import type { AgentRole } from '../../domain/agent-message';
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

interface StreamHealth {
  ttfpMs: number | null;
  maxGapMs: number;
  parts: number;
  textDeltas: number;
  finishReason: string | null;
  upstream: string | null;
}

const AGENT_TEMPERATURE = 0.7;

// AI SDK finishReason when the completion was truncated at the output-token cap.
const FINISH_REASON_LENGTH = 'length';

const AGENT_TURN_OUTCOME = {
  DONE: 'done',
  PROPOSAL: 'proposal',
  ERROR: 'error',
  STALL: 'stall',
  TIMEOUT: 'timeout',
  ABORTED: 'aborted',
  EMPTY: 'empty',
} as const;
type AgentTurnOutcome =
  (typeof AGENT_TURN_OUTCOME)[keyof typeof AGENT_TURN_OUTCOME];

// Not an AbortError on purpose: the chain must treat a stalled candidate as a
// retryable provider failure, not as a user cancel.
class AgentStallError extends Error {
  constructor(stallMs: number) {
    super(`No stream activity for ${stallMs}ms`);
    this.name = 'AgentStallError';
  }
}

function isSourceNote(value: unknown): value is { id: string; title: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string';
}

// A pinned upstream order must still permit backups: if the whole allowlist is
// down, allow_fallbacks lets OpenRouter route elsewhere rather than hard-fail.
const OPENROUTER_ALLOW_FALLBACKS = true;

// OpenRouter-only: other providers ignore or reject these keys. Merges reasoning
// effort and the vetted upstream allowlist into one spread-able `openrouter`
// block; `provider` is omitted when the order list is empty.
function openrouterProviderOptions(
  model: string,
  reasoningEffort: ReasoningEffort | undefined,
  providerOrder: readonly string[] | undefined
) {
  if (providerOf(model) !== 'openrouter') {
    return {};
  }
  const order =
    providerOrder && providerOrder.length > 0 ? [...providerOrder] : null;
  if (!reasoningEffort && !order) {
    return {};
  }
  return {
    providerOptions: {
      openrouter: {
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(order
          ? { provider: { order, allow_fallbacks: OPENROUTER_ALLOW_FALLBACKS } }
          : {}),
      },
    },
  };
}

// OpenRouter routes to a rotating upstream (Fireworks, Together, …) and reports
// it on the finish-step part's providerMetadata; other parts carry an openrouter
// block without `provider`, so only a string value counts.
function openrouterUpstreamOf(part: unknown): string | null {
  if (typeof part !== 'object' || part === null) {
    return null;
  }
  const metadata = (part as { providerMetadata?: unknown }).providerMetadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return null;
  }
  const openrouter = (metadata as { openrouter?: unknown }).openrouter;
  if (typeof openrouter !== 'object' || openrouter === null) {
    return null;
  }
  const provider = (openrouter as { provider?: unknown }).provider;
  return typeof provider === 'string' ? provider : null;
}

@Injectable()
export class AiSdkAgentOrchestrator implements AgentOrchestrator {
  private readonly logger = new Logger(AiSdkAgentOrchestrator.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly toolRegistry: AgentToolRegistry,
    private readonly providerRegistry: ProviderRegistryFactory,
    private readonly fallbackChain: FallbackChainService,
    private readonly featureFlags: FeatureFlagsService
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
      isEphemeralChunk: (event) => event.type === 'thinking',
    });
  }

  private async *runTurn(
    input: AgentRunInput,
    model: string,
    abortSignal: AbortSignal,
    timeoutSignal: AbortSignal,
    options: { throwOnFreshFailure: boolean }
  ): AsyncGenerator<AgentEvent> {
    const turnStartedAt = Date.now();
    const health: StreamHealth = {
      ttfpMs: null,
      maxGapMs: 0,
      parts: 0,
      textDeltas: 0,
      finishReason: null,
      upstream: null,
    };
    let lastPartAt = turnStartedAt;
    let healthLogged = false;
    const logHealth = (outcome: AgentTurnOutcome) => {
      if (healthLogged) {
        return;
      }
      healthLogged = true;
      this.logger.log({
        event: 'agent.turn.health',
        userId: input.userId,
        model,
        outcome,
        ttfpMs: health.ttfpMs,
        maxGapMs: health.maxGapMs,
        parts: health.parts,
        textDeltas: health.textDeltas,
        finishReason: health.finishReason,
        upstream: health.upstream,
        elapsedMs: Date.now() - turnStartedAt,
      });
    };

    const sources = new Map<string, AgentSource>();
    const knownNotes = new Map<string, AgentSource>();
    for (const note of input.knownNotes ?? []) {
      knownNotes.set(note.id, note);
    }
    const proposals = new ProposalCollector();
    const webSourceCollector = new WebSourceCollector();
    const webFetchAllowlist = new WebFetchAllowlist();
    webFetchAllowlist.seedFromMessages(input.messages);
    const toolContext: AgentToolContext = {
      userId: input.userId,
      phase: input.resume ? 'readonly' : 'full',
      byokTurn: Boolean(input.byokApiKey),
      proposals,
      webSources: webSourceCollector,
      webFetchAllowlist,
    };
    const stepUsage: StepUsageAccumulator = { inputTokens: 0, outputTokens: 0 };

    // Setup runs before the stream starts, so a rejection here still owes the
    // once-per-attempt health event; log the zero-activity outcome and rethrow
    // unchanged so streamWithChain treats it as a fresh failure.
    let tools: ToolSet;
    let cache: boolean;
    let systemPrompt: string;
    let messages: { role: AgentRole; content: string }[];
    try {
      tools = await this.toolRegistry.resolve(toolContext);
      // BYOK turns never cache: cache writes bill 1.25x to the key owner.
      cache = !input.byokApiKey && (await this.promptCachingEnabled());
      systemPrompt = this.buildSystemPrompt(
        input.noteId,
        input.knownNotes,
        input.userMemories
      );
      messages = input.resume
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
          }));
    } catch (error) {
      logHealth(AGENT_TURN_OUTCOME.ERROR);
      throw error;
    }

    let progressed = false;
    let streamError: unknown;
    let result;
    const stallMs = this.configService.get('AI_AGENT_STALL_MS');
    const candidate = new AbortController();
    const runSignal = AbortSignal.any([abortSignal, candidate.signal]);
    let stalled = false;
    let stallTimer: NodeJS.Timeout | undefined;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        candidate.abort();
      }, stallMs);
    };
    try {
      result = streamText({
        model: this.providerRegistry.languageModel(model, input.byokApiKey),
        ...(cache
          ? cacheableSystem(model, systemPrompt)
          : { system: systemPrompt }),
        messages: cache ? withLastMessageCache(model, messages) : messages,
        tools,
        stopWhen: stepCountIs(input.maxSteps),
        maxOutputTokens: this.configService.get('AI_AGENT_MAX_OUTPUT_TOKENS'),
        maxRetries: this.configService.get('AI_MAX_RETRIES'),
        temperature: AGENT_TEMPERATURE,
        ...openrouterProviderOptions(
          model,
          input.reasoningEffort,
          input.openrouterProviderOrder
        ),
        abortSignal: runSignal,
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
      logHealth(AGENT_TURN_OUTCOME.ERROR);
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
      armStallTimer();
      for await (const part of result.fullStream) {
        armStallTimer();
        const partAt = Date.now();
        if (health.ttfpMs === null) {
          health.ttfpMs = partAt - turnStartedAt;
        } else {
          health.maxGapMs = Math.max(health.maxGapMs, partAt - lastPartAt);
        }
        lastPartAt = partAt;
        health.parts += 1;
        const upstream = openrouterUpstreamOf(part);
        if (upstream !== null) {
          health.upstream = upstream;
        }
        switch (part.type) {
          case 'reasoning-delta':
            if (part.text) {
              yield { type: 'thinking', text: part.text };
            }
            break;
          case 'text-delta':
            if (part.text) {
              progressed = true;
              health.textDeltas += 1;
              yield { type: 'chunk', text: part.text };
            }
            break;
          case 'finish':
            health.finishReason = part.finishReason;
            break;
          case 'error':
            streamError = part.error;
            break;
          default:
            break;
        }
      }
      clearTimeout(stallTimer);
      const interrupted = this.interruptionEvent(
        input,
        model,
        timeoutSignal,
        stepUsage
      );
      if (interrupted) {
        logHealth(
          input.signal?.aborted
            ? AGENT_TURN_OUTCOME.ABORTED
            : AGENT_TURN_OUTCOME.TIMEOUT
        );
        yield interrupted;
        return;
      }
      if (stalled) {
        logHealth(AGENT_TURN_OUTCOME.STALL);
        yield this.stallOutcome(
          input,
          model,
          stepUsage,
          progressed,
          options,
          stallMs
        );
        return;
      }
      const usage = await result.totalUsage;
      const turnUsage = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
        model,
      };
      const captured = proposals.captured;
      if (captured) {
        logHealth(AGENT_TURN_OUTCOME.PROPOSAL);
        yield { type: 'proposal', proposal: captured, usage: turnUsage };
        return;
      }
      // Reasoning that consumes the whole output cap leaves zero visible text:
      // the tokens were billed, so fail honestly instead of an empty done.
      if (
        health.textDeltas === 0 &&
        health.finishReason === FINISH_REASON_LENGTH
      ) {
        logHealth(AGENT_TURN_OUTCOME.EMPTY);
        yield {
          type: 'error',
          error: AIErrors.emptyCompletion(),
          usage: turnUsage,
        };
        return;
      }
      logHealth(
        health.textDeltas > 0 ? AGENT_TURN_OUTCOME.DONE : AGENT_TURN_OUTCOME.EMPTY
      );
      yield {
        type: 'done',
        usage: turnUsage,
        sources: [...sources.values()],
        knownNotes: [...knownNotes.values()],
        webSources: webSourceCollector.all,
      };
    } catch (error) {
      // The after-loop branch already reported and threw AgentStallError, so
      // it must pass through here untouched instead of being logged again.
      if (error instanceof AgentStallError) {
        throw error;
      }
      const interrupted = this.interruptionEvent(
        input,
        model,
        timeoutSignal,
        stepUsage
      );
      if (interrupted) {
        logHealth(
          input.signal?.aborted
            ? AGENT_TURN_OUTCOME.ABORTED
            : AGENT_TURN_OUTCOME.TIMEOUT
        );
        yield interrupted;
        return;
      }
      if (stalled) {
        logHealth(AGENT_TURN_OUTCOME.STALL);
        yield this.stallOutcome(
          input,
          model,
          stepUsage,
          progressed,
          options,
          stallMs
        );
        return;
      }
      // streamText reports provider failures as error parts and then rejects
      // totalUsage with a generic NoOutputGeneratedError, so the captured part
      // carries the real cause (and its statusCode).
      const cause = streamError ?? error;
      if (options.throwOnFreshFailure && !progressed && !isAbortError(cause)) {
        logHealth(AGENT_TURN_OUTCOME.ERROR);
        throw cause;
      }
      const redact = Boolean(input.byokApiKey);
      this.logger.error({
        event: 'agent.run.error',
        userId: input.userId,
        model,
        error: this.errorMessage(cause, redact),
      });
      logHealth(AGENT_TURN_OUTCOME.ERROR);
      yield {
        type: 'error',
        error: this.toError(cause, redact),
        usage: this.bestEffortUsage(model, stepUsage),
      };
    } finally {
      clearTimeout(stallTimer);
    }
  }

  // Throws (chain advances) only for a retryable fresh failure; otherwise the
  // turn ends honestly as a timeout the client can retry.
  private stallOutcome(
    input: AgentRunInput,
    model: string,
    stepUsage: StepUsageAccumulator,
    progressed: boolean,
    options: { throwOnFreshFailure: boolean },
    stallMs: number
  ): AgentEvent {
    this.logger.warn({
      event: 'agent.turn.stall',
      userId: input.userId,
      model,
      stallMs,
    });
    if (options.throwOnFreshFailure && !progressed) {
      throw new AgentStallError(stallMs);
    }
    return {
      type: 'error',
      error: AIErrors.timeout('Agent turn stalled'),
      usage: this.bestEffortUsage(model, stepUsage),
    };
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
        error: AIErrors.timeout('Agent turn timed out'),
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

  private async promptCachingEnabled(): Promise<boolean> {
    try {
      return await this.featureFlags.isEnabled(
        FEATURE_FLAG_KEYS.AGENT_PROMPT_CACHING
      );
    } catch (error) {
      this.logger.warn(
        'Prompt caching flag lookup failed, treating as off',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
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
