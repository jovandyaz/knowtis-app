import { Logger } from '@nestjs/common';
import {
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
  type TelemetrySettings,
  type ToolSet,
  type TypedToolResult,
} from 'ai';

import {
  isAbortError,
  isOverloadedError,
  providerOf,
} from '@knowtis/ai-gateway';
import type { ReasoningEffort } from '@knowtis/shared-types';

import {
  AIErrors,
  type AIDomainError,
} from '../../../ai/domain/errors/ai.errors';
import {
  cacheableSystem,
  withLastMessageCache,
} from '../../../ai/infrastructure/providers/anthropic-cache';
import { ProviderRegistryFactory } from '../../../ai/infrastructure/providers/provider-registry.factory';
import type {
  AgentEvent,
  AgentSource,
  AgentTurnUsage,
} from '../../domain/agent-event';
import type { AgentRunInput } from '../../domain/ports/agent-orchestrator.port';
import { ProposalCollector } from './proposal-collector';
import { WebSourceCollector } from './web-source.collector';

// Toolset is open here, so the SDK collapses input/output to unknown — exactly
// what the collectors narrow with isSourceNote. Derived, not hand-copied.
type StepToolResult = TypedToolResult<ToolSet>;

interface StepUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
}

interface TurnUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface StreamHealth {
  ttfpMs: number | null;
  maxGapMs: number;
  parts: number;
  textDeltas: number;
  finishReason: string | null;
  upstream: string | null;
}

export function createHealth(): StreamHealth {
  return {
    ttfpMs: null,
    maxGapMs: 0,
    parts: 0,
    textDeltas: 0,
    finishReason: null,
    upstream: null,
  };
}

const AGENT_TEMPERATURE = 0.7;

// One initial call plus a single retry, applied per LLM call. A call that
// streams nothing produced no visible output and appended no messages, so it is
// safe to re-run once from the same history before failing over.
const MAX_STEP_ATTEMPTS = 2;

// Local stream control markers with no model output: 'start' is enqueued
// synchronously at stream open, 'abort' when the watchdog cancels a call.
// ('start-step' is excluded — the SDK flips it only on the first provider chunk.)
const STREAM_MARKER_PART_TYPES = new Set<string>(['start', 'abort']);

const FINISH_REASON_LENGTH = 'length';
const FINISH_REASON_TOOL_CALLS = 'tool-calls';

export const AGENT_TURN_OUTCOME = {
  DONE: 'done',
  PROPOSAL: 'proposal',
  ERROR: 'error',
  STALL: 'stall',
  TIMEOUT: 'timeout',
  ABORTED: 'aborted',
  EMPTY: 'empty',
  CONTINUED: 'continued',
} as const;
export type AgentTurnOutcome =
  (typeof AGENT_TURN_OUTCOME)[keyof typeof AGENT_TURN_OUTCOME];

// Not an AbortError on purpose: the chain must treat a stalled call as a
// retryable provider failure, not as a user cancel.
class AgentStallError extends Error {
  constructor(stallMs: number) {
    super(`No stream activity for ${stallMs}ms`);
    this.name = 'AgentStallError';
  }
}

function isSourceNote(value: unknown): value is { id: string; title: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string'
  );
}

// A pinned upstream order must still permit backups: if the whole allowlist is
// down, allow_fallbacks lets OpenRouter route elsewhere rather than hard-fail.
const OPENROUTER_ALLOW_FALLBACKS = true;

// Non-OpenRouter providers reject these providerOptions keys.
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
  if (
    typeof part !== 'object' ||
    part === null ||
    !('providerMetadata' in part)
  ) {
    return null;
  }
  const metadata = part.providerMetadata;
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('openrouter' in metadata)
  ) {
    return null;
  }
  const openrouter = metadata.openrouter;
  if (
    typeof openrouter !== 'object' ||
    openrouter === null ||
    !('provider' in openrouter)
  ) {
    return null;
  }
  const provider = openrouter.provider;
  return typeof provider === 'string' ? provider : null;
}

function collectSources(
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

function collectKnownNotes(
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

function accumulateTurnUsage(
  acc: TurnUsageAccumulator,
  usage: LanguageModelUsage
): void {
  acc.inputTokens += usage.inputTokens ?? 0;
  acc.outputTokens += usage.outputTokens ?? 0;
  acc.cacheReadTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0;
  acc.cacheWriteTokens += usage.inputTokenDetails?.cacheWriteTokens ?? 0;
}

function turnUsageEvent(
  acc: TurnUsageAccumulator,
  model: string
): AgentTurnUsage {
  return {
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    model,
  };
}

function bestEffortUsage(
  model: string,
  stepUsage: StepUsageAccumulator
): AgentTurnUsage {
  return {
    inputTokens: stepUsage.inputTokens,
    outputTokens: stepUsage.outputTokens,
    model,
  };
}

// Provider/SDK auth errors can echo key material (e.g. OpenAI's "Incorrect
// API key provided: sk-…"), so a BYOK turn must never surface the raw message.
function errorMessage(error: unknown, redact: boolean): string {
  if (redact) {
    return 'BYOK provider request failed';
  }
  return error instanceof Error ? error.message : 'Agent run failed';
}

function toError(error: unknown, redact = false) {
  if (isOverloadedError(error)) {
    return AIErrors.providerOverloaded();
  }
  return AIErrors.providerError(errorMessage(error, redact));
}

function errorEvent(
  error: AIDomainError | { code: string; message: string },
  usage?: AgentTurnUsage
): AgentEvent {
  return { type: AGENT_TURN_OUTCOME.ERROR, error, ...(usage ? { usage } : {}) };
}

export function emitTurnHealth(
  logger: Logger,
  userId: string,
  model: string,
  health: StreamHealth,
  outcome: AgentTurnOutcome,
  startedAt: number
): void {
  logger.log({
    event: 'agent.turn.health',
    userId,
    model,
    outcome,
    ttfpMs: health.ttfpMs,
    maxGapMs: health.maxGapMs,
    parts: health.parts,
    textDeltas: health.textDeltas,
    finishReason: health.finishReason,
    upstream: health.upstream,
    elapsedMs: Date.now() - startedAt,
  });
}

function logRetry(
  logger: Logger,
  userId: string,
  model: string,
  attempt: number
): void {
  logger.warn({
    event: 'agent.turn.retry',
    userId,
    model,
    attempt,
    reason: 'ttft',
  });
}

// A call that streamed no model part is idempotent, so it may be re-run once. A
// stall after any part is a provider stall on that call — never a retry here.
function canRetrySilentStep(health: StreamHealth, attempt: number): boolean {
  return health.parts === 0 && attempt + 1 < MAX_STEP_ATTEMPTS;
}

// totalUsage never settles on an interrupted stream, so terminal events for
// abort/timeout must rely on the per-step accumulator instead of awaiting it.
function interruptionEvent(
  input: AgentRunInput,
  model: string,
  timeoutSignal: AbortSignal,
  stepUsage: StepUsageAccumulator,
  maxMs: number,
  logger: Logger
): AgentEvent | undefined {
  if (input.signal?.aborted) {
    return {
      type: 'aborted',
      usage: bestEffortUsage(model, stepUsage),
    };
  }
  if (timeoutSignal.aborted) {
    logger.warn({
      event: 'agent.turn.timeout',
      userId: input.userId,
      model,
      maxMs,
    });
    return errorEvent(
      AIErrors.timeout('Agent turn timed out'),
      bestEffortUsage(model, stepUsage)
    );
  }
  return undefined;
}

// Throws (chain advances) only for a retryable fresh failure; otherwise the turn
// ends honestly as a timeout the client can retry. `progressed` is turn-wide:
// once tool work happened, the chain never switches models mid-turn.
function stallOutcome(
  input: AgentRunInput,
  model: string,
  stepUsage: StepUsageAccumulator,
  progressed: boolean,
  throwOnFreshFailure: boolean,
  stallMs: number,
  logger: Logger
): AgentEvent {
  logger.warn({
    event: 'agent.turn.stall',
    userId: input.userId,
    model,
    stallMs,
  });
  if (throwOnFreshFailure && !progressed) {
    throw new AgentStallError(stallMs);
  }
  return errorEvent(
    AIErrors.timeout('Agent turn stalled'),
    bestEffortUsage(model, stepUsage)
  );
}

export interface AgentStepLoopParams {
  readonly logger: Logger;
  readonly providerRegistry: ProviderRegistryFactory;
  readonly input: AgentRunInput;
  readonly model: string;
  readonly abortSignal: AbortSignal;
  readonly timeoutSignal: AbortSignal;
  readonly throwOnFreshFailure: boolean;
  readonly system: string;
  readonly cache: boolean;
  readonly tools: ToolSet;
  readonly telemetry: TelemetrySettings;
  readonly initialMessages: ModelMessage[];
  readonly budgets: {
    readonly stallMs: number;
    readonly ttftMs: number;
    readonly maxOutputTokens: number;
    readonly maxRetries: number;
    readonly maxMs: number;
  };
  readonly sources: Map<string, AgentSource>;
  readonly knownNotes: Map<string, AgentSource>;
  readonly proposals: ProposalCollector;
  readonly webSources: WebSourceCollector;
}

/**
 * Runs a turn as a hand-rolled loop of one streamText call per step
 * (`stopWhen: stepCountIs(1)`), threading each completed call's
 * `response.messages` into a running history so every call — including a
 * continuation after tool work — gets its own TTFT/stall budget and silent-call
 * retry. Yields `thinking`/`chunk` events during streaming and a single
 * terminal event (`done`/`proposal`/`aborted`/`error`). Throws `AgentStallError`
 * to advance the fallback chain on a fresh first-call stall.
 */
export async function* runAgentStepLoop(
  params: AgentStepLoopParams
): AsyncGenerator<AgentEvent> {
  const { input, model, logger, providerRegistry } = params;
  const { stallMs, ttftMs, maxOutputTokens, maxRetries, maxMs } =
    params.budgets;
  const byok = Boolean(input.byokApiKey);
  const providerOptions = openrouterProviderOptions(
    model,
    input.reasoningEffort,
    input.openrouterProviderOrder
  );

  // No-partial-append invariant: only a completed call appends its
  // response.messages; a stalled/errored/aborted call appends nothing, so its
  // retry re-runs from the same history and never re-executes prior tools.
  const history: ModelMessage[] = [...params.initialMessages];
  const stepUsage: StepUsageAccumulator = { inputTokens: 0, outputTokens: 0 };
  const turnUsage: TurnUsageAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let turnProgressed = false;
  let turnTextDeltas = 0;
  let completedSteps = 0;

  while (completedSteps < input.maxSteps) {
    let advanceToNextStep = false;

    for (let attempt = 0; attempt < MAX_STEP_ATTEMPTS; attempt++) {
      const callStartedAt = Date.now();
      const health = createHealth();
      let lastPartAt = callStartedAt;
      let healthLogged = false;
      const logHealth = (outcome: AgentTurnOutcome) => {
        if (healthLogged) {
          return;
        }
        healthLogged = true;
        emitTurnHealth(
          logger,
          input.userId,
          model,
          health,
          outcome,
          callStartedAt
        );
      };

      let streamError: unknown;
      let result;
      // Flips on the first received part: silence before it is bounded by the
      // TTFT budget, silence after it by the (longer) stall budget.
      let firstPartReceived = false;
      const candidate = new AbortController();
      const runSignal = AbortSignal.any([params.abortSignal, candidate.signal]);
      let stalled = false;
      let stallTimer: NodeJS.Timeout | undefined;
      const armStallTimer = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(
          () => {
            stalled = true;
            candidate.abort();
          },
          firstPartReceived ? stallMs : ttftMs
        );
      };

      try {
        result = streamText({
          model: providerRegistry.languageModel(model, input.byokApiKey),
          ...(params.cache
            ? cacheableSystem(model, params.system)
            : { system: params.system }),
          messages: params.cache
            ? withLastMessageCache(model, history)
            : history,
          tools: params.tools,
          stopWhen: stepCountIs(1),
          maxOutputTokens,
          maxRetries,
          temperature: AGENT_TEMPERATURE,
          ...providerOptions,
          abortSignal: runSignal,
          onStepFinish: ({ toolResults, usage }) => {
            turnProgressed = true;
            collectSources(toolResults, params.sources);
            collectKnownNotes(toolResults, params.knownNotes);
            stepUsage.inputTokens += usage?.inputTokens ?? 0;
            stepUsage.outputTokens += usage?.outputTokens ?? 0;
          },
          experimental_telemetry: params.telemetry,
        });
      } catch (error) {
        logHealth(AGENT_TURN_OUTCOME.ERROR);
        if (params.throwOnFreshFailure && !isAbortError(error)) {
          throw error;
        }
        yield errorEvent(toError(error, byok));
        return;
      }

      try {
        armStallTimer();
        for await (const part of result.fullStream) {
          if (STREAM_MARKER_PART_TYPES.has(part.type)) {
            continue;
          }
          firstPartReceived = true;
          armStallTimer();
          const partAt = Date.now();
          if (health.ttfpMs === null) {
            health.ttfpMs = partAt - callStartedAt;
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
                turnProgressed = true;
                health.textDeltas += 1;
                turnTextDeltas += 1;
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
        const interrupted = interruptionEvent(
          input,
          model,
          params.timeoutSignal,
          stepUsage,
          maxMs,
          logger
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
          if (canRetrySilentStep(health, attempt)) {
            logRetry(logger, input.userId, model, attempt + 1);
            continue;
          }
          yield stallOutcome(
            input,
            model,
            stepUsage,
            turnProgressed,
            params.throwOnFreshFailure,
            stallMs,
            logger
          );
          return;
        }
        accumulateTurnUsage(turnUsage, await result.totalUsage);
        const captured = params.proposals.captured;
        if (captured) {
          logHealth(AGENT_TURN_OUTCOME.PROPOSAL);
          yield {
            type: 'proposal',
            proposal: captured,
            usage: turnUsageEvent(turnUsage, model),
          };
          return;
        }
        const willContinue =
          health.finishReason === FINISH_REASON_TOOL_CALLS &&
          completedSteps + 1 < input.maxSteps;
        if (willContinue) {
          logHealth(AGENT_TURN_OUTCOME.CONTINUED);
          const { messages } = await result.response;
          history.push(...messages);
          advanceToNextStep = true;
          break;
        }
        // Reasoning that consumes the whole output cap leaves zero visible text:
        // the tokens were billed, so fail honestly instead of an empty done.
        if (
          turnTextDeltas === 0 &&
          health.finishReason === FINISH_REASON_LENGTH
        ) {
          logHealth(AGENT_TURN_OUTCOME.EMPTY);
          yield errorEvent(
            AIErrors.emptyCompletion(),
            turnUsageEvent(turnUsage, model)
          );
          return;
        }
        logHealth(
          turnTextDeltas > 0
            ? AGENT_TURN_OUTCOME.DONE
            : AGENT_TURN_OUTCOME.EMPTY
        );
        yield {
          type: 'done',
          usage: turnUsageEvent(turnUsage, model),
          sources: [...params.sources.values()],
          knownNotes: [...params.knownNotes.values()],
          webSources: params.webSources.all,
        };
        return;
      } catch (error) {
        // The after-loop branch already reported and threw AgentStallError, so
        // it must pass through here untouched instead of being logged again.
        if (error instanceof AgentStallError) {
          throw error;
        }
        const interrupted = interruptionEvent(
          input,
          model,
          params.timeoutSignal,
          stepUsage,
          maxMs,
          logger
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
          if (canRetrySilentStep(health, attempt)) {
            logRetry(logger, input.userId, model, attempt + 1);
            continue;
          }
          yield stallOutcome(
            input,
            model,
            stepUsage,
            turnProgressed,
            params.throwOnFreshFailure,
            stallMs,
            logger
          );
          return;
        }
        // streamText reports provider failures as error parts and then rejects
        // totalUsage with a generic NoOutputGeneratedError, so the captured part
        // carries the real cause (and its statusCode).
        const cause = streamError ?? error;
        if (
          params.throwOnFreshFailure &&
          !turnProgressed &&
          !isAbortError(cause)
        ) {
          logHealth(AGENT_TURN_OUTCOME.ERROR);
          throw cause;
        }
        logger.error({
          event: 'agent.run.error',
          userId: input.userId,
          model,
          error: errorMessage(cause, byok),
        });
        logHealth(AGENT_TURN_OUTCOME.ERROR);
        yield errorEvent(
          toError(cause, byok),
          bestEffortUsage(model, stepUsage)
        );
        return;
      } finally {
        clearTimeout(stallTimer);
      }
    }

    if (advanceToNextStep) {
      completedSteps += 1;
      continue;
    }
    return;
  }
}
