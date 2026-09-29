import { Logger } from '@nestjs/common';
import {
  isStepCount,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
  type StreamTextResult,
  type TelemetryOptions,
  type ToolSet,
} from 'ai';

import { isOverloadedError } from '@knowtis/ai-gateway';

import {
  databaseDiagnostics,
  isDatabaseError,
  type DatabaseDiagnostics,
} from '../../../../core/errors/database-diagnostics';
import { reasonOf } from '../../../../core/errors/reason-of';
import {
  AIErrors,
  type AIDomainError,
} from '../../../ai/domain/errors/ai.errors';
import {
  cacheableInstructions,
  withLastMessageCache,
} from '../../../ai/infrastructure/providers/anthropic-cache';
import { ProviderRegistryFactory } from '../../../ai/infrastructure/providers/provider-registry.factory';
import {
  withTraceIdentity,
  type TraceIdentityAttrs,
} from '../../../ai/infrastructure/providers/trace-identity';
import type { TurnProviderOptions } from '../../../ai/infrastructure/providers/turn-provider-options';
import type {
  AgentEvent,
  AgentSource,
  AgentTurnUsage,
} from '../../domain/agent-event';
import type { AgentRunInput } from '../../domain/ports/agent-orchestrator.port';
import { ToolExecutionError } from '../tools/tool-execution.error';
import {
  createHealth,
  openrouterUpstreamOf,
  STREAM_MARKER_PART_TYPES,
  type StreamHealth,
} from './stream-health';
import { scanForToolMarkup } from './tool-markup-guard';
import { collectKnownNotes, collectSources } from './turn-collectors';
import { bestEffortUsage, type StepUsageAccumulator } from './turn-usage';

const AGENT_TEMPERATURE = 0.7;
const TOOL_ERROR_LOG_MAX_CHARS = 300;
const AGENT_RUN_FAILED = 'Agent run failed';

export function errorMessage(error: unknown, redact: boolean): string {
  if (redact) {
    return 'BYOK provider request failed';
  }
  return error instanceof Error ? reasonOf(error) : AGENT_RUN_FAILED;
}

function describeToolError(
  error: unknown
): { code: string; error: string } & Partial<DatabaseDiagnostics> {
  if (error instanceof ToolExecutionError) {
    return {
      code: error.code,
      error: error.message.slice(0, TOOL_ERROR_LOG_MAX_CHARS),
      ...(isDatabaseError(error.cause) && databaseDiagnostics(error.cause)),
    };
  }
  const message =
    error instanceof Error
      ? reasonOf(error)
      : typeof error === 'string'
        ? error
        : 'non-Error value thrown';
  return {
    code: 'UNCLASSIFIED',
    error: message.slice(0, TOOL_ERROR_LOG_MAX_CHARS),
  };
}

/** The error the client receives; a database failure's diagnostics name tables and constraints, so they stay in the log. */
export function toError(error: unknown, redact = false) {
  if (isOverloadedError(error)) {
    return AIErrors.providerOverloaded();
  }
  return AIErrors.providerError(
    isDatabaseError(error) ? AGENT_RUN_FAILED : errorMessage(error, redact)
  );
}

export function errorEvent(
  error: AIDomainError | { code: string; message: string },
  usage?: AgentTurnUsage
): AgentEvent {
  return { type: 'error', error, ...(usage ? { usage } : {}) };
}

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
      userId: input.execution.subject.userId,
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

/** Turn-wide accumulators the loop owns and each call mutates in place. */
export interface TurnState {
  progressed: boolean;
  textDeltas: number;
  readonly stepUsage: StepUsageAccumulator;
  readonly sources: Map<string, AgentSource>;
  readonly knownNotes: Map<string, AgentSource>;
}

export interface StepCallParams {
  readonly logger: Logger;
  readonly input: AgentRunInput;
  readonly model: string;
  readonly providerRegistry: ProviderRegistryFactory;
  readonly abortSignal: AbortSignal;
  readonly timeoutSignal: AbortSignal;
  readonly instructions: string;
  readonly cache: boolean;
  readonly tools: ToolSet;
  readonly toolChoice?: 'none';
  /** Ends the call as `leaked` once its text turns into raw tool-call markup, streaming only the text and thinking before it. */
  readonly failOnToolMarkup: boolean;
  readonly telemetry: TelemetryOptions;
  readonly traceIdentity: TraceIdentityAttrs;
  readonly providerOptions: TurnProviderOptions;
  readonly history: ModelMessage[];
  /** Sent after the cache breakpoint, so a one-off message never moves it off the replayable history. */
  readonly trailingMessage?: ModelMessage;
  readonly budgets: {
    readonly stallMs: number;
    readonly ttftMs: number;
    readonly maxOutputTokens: number;
    readonly maxRetries: number;
    readonly maxMs: number;
  };
  readonly turn: TurnState;
}

interface StepCallHealth {
  readonly health: StreamHealth;
  readonly callStartedAt: number;
}

export const STEP_CALL_KIND = {
  COMPLETED: 'completed',
  STALLED: 'stalled',
  INTERRUPTED: 'interrupted',
  ERRORED: 'errored',
  LEAKED: 'leaked',
} as const;

/** Outcome of one streamText attempt; `completed` carries `response` for the loop to await once per completed call. */
export type StepCallResult =
  | (StepCallHealth & {
      kind: typeof STEP_CALL_KIND.COMPLETED;
      finishReason: string | null;
      usage: LanguageModelUsage;
      response: StreamTextResult<ToolSet, never, never>['response'];
    })
  | (StepCallHealth & { kind: typeof STEP_CALL_KIND.STALLED })
  | (StepCallHealth & {
      kind: typeof STEP_CALL_KIND.INTERRUPTED;
      event: AgentEvent;
    })
  | (StepCallHealth & {
      kind: typeof STEP_CALL_KIND.ERRORED;
      cause: unknown;
      fromStream: boolean;
    })
  | (StepCallHealth & {
      kind: typeof STEP_CALL_KIND.LEAKED;
      usage: LanguageModelUsage | undefined;
    });

/**
 * Runs one streamText attempt: yields `thinking`/`chunk` and returns a
 * `StepCallResult` via `yield*`. Never logs health. A `leaked` call is read to
 * its end, so its usage and upstream are known, but nothing after the markup
 * is streamed.
 */
export async function* runStepCall(
  params: StepCallParams
): AsyncGenerator<AgentEvent, StepCallResult> {
  const { logger, input, model, turn } = params;
  const { userId } = input.execution.subject;
  const { stallMs, ttftMs, maxOutputTokens, maxRetries, maxMs } =
    params.budgets;
  const callStartedAt = Date.now();
  const health = createHealth();
  let lastPartAt = callStartedAt;

  let streamError: unknown;
  let result;
  let firstPartReceived = false;
  const candidate = new AbortController();
  const runSignal = AbortSignal.any([params.abortSignal, candidate.signal]);
  let stalled = false;
  let leaked = false;
  let heldText = '';
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
    const history = params.cache
      ? withLastMessageCache(model, params.history)
      : params.history;
    result = withTraceIdentity(params.traceIdentity, () =>
      streamText({
        model: params.providerRegistry.languageModel(model, input.byokApiKey),
        ...(params.cache
          ? cacheableInstructions(model, params.instructions)
          : { instructions: params.instructions }),
        messages: params.trailingMessage
          ? [...history, params.trailingMessage]
          : history,
        tools: params.tools,
        ...(params.toolChoice ? { toolChoice: params.toolChoice } : {}),
        stopWhen: isStepCount(1),
        maxOutputTokens,
        maxRetries,
        temperature: AGENT_TEMPERATURE,
        ...params.providerOptions,
        abortSignal: runSignal,
        onStepEnd: ({ toolResults, usage }) => {
          turn.progressed = true;
          collectSources(toolResults, turn.sources);
          collectKnownNotes(toolResults, turn.knownNotes);
          turn.stepUsage.inputTokens += usage?.inputTokens ?? 0;
          turn.stepUsage.outputTokens += usage?.outputTokens ?? 0;
        },
        telemetry: params.telemetry,
      })
    );
  } catch (error) {
    return {
      kind: STEP_CALL_KIND.ERRORED,
      cause: error,
      fromStream: false,
      health,
      callStartedAt,
    };
  }

  const chunkOf = (text: string): AgentEvent => {
    turn.progressed = true;
    health.textDeltas += 1;
    turn.textDeltas += 1;
    return { type: 'chunk', text };
  };

  try {
    armStallTimer();
    for await (const part of result.stream) {
      // The SDK never throws from streamText for provider/API failures: a
      // failed call (after its own maxRetries) arrives as this terminal part.
      // Nothing reached the client, so it must not count as a received part
      // or the "before anything streamed" retry gates could never fire.
      if (part.type === 'error') {
        streamError = part.error;
        continue;
      }
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
          if (part.text && !leaked) {
            yield { type: 'thinking', text: part.text };
          }
          break;
        case 'text-delta': {
          if (!part.text || leaked) {
            break;
          }
          if (!params.failOnToolMarkup) {
            yield chunkOf(part.text);
            break;
          }
          const scan = scanForToolMarkup(heldText, part.text);
          heldText = scan.held;
          leaked = scan.leaked;
          if (scan.emit) {
            yield chunkOf(scan.emit);
          }
          break;
        }
        case 'tool-call':
          health.toolCalls += 1;
          break;
        case 'tool-error':
          health.toolErrors += 1;
          logger.warn({
            event: 'agent.tool.error',
            userId,
            model,
            toolName: part.toolName,
            ...describeToolError(part.error),
          });
          break;
        case 'finish':
          health.finishReason = part.finishReason;
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
      turn.stepUsage,
      maxMs,
      logger
    );
    if (interrupted) {
      return {
        kind: STEP_CALL_KIND.INTERRUPTED,
        event: interrupted,
        health,
        callStartedAt,
      };
    }
    if (leaked) {
      return {
        kind: STEP_CALL_KIND.LEAKED,
        usage: stalled ? undefined : await result.usage,
        health,
        callStartedAt,
      };
    }
    if (stalled) {
      return { kind: STEP_CALL_KIND.STALLED, health, callStartedAt };
    }
    if (heldText) {
      yield chunkOf(heldText);
    }
    const usage = await result.usage;
    return {
      kind: STEP_CALL_KIND.COMPLETED,
      finishReason: health.finishReason,
      usage,
      response: result.response,
      health,
      callStartedAt,
    };
  } catch (error) {
    const interrupted = interruptionEvent(
      input,
      model,
      params.timeoutSignal,
      turn.stepUsage,
      maxMs,
      logger
    );
    if (interrupted) {
      return {
        kind: STEP_CALL_KIND.INTERRUPTED,
        event: interrupted,
        health,
        callStartedAt,
      };
    }
    if (leaked) {
      return {
        kind: STEP_CALL_KIND.LEAKED,
        usage: undefined,
        health,
        callStartedAt,
      };
    }
    if (stalled) {
      return { kind: STEP_CALL_KIND.STALLED, health, callStartedAt };
    }
    const cause = streamError ?? error;
    return {
      kind: STEP_CALL_KIND.ERRORED,
      cause,
      fromStream: true,
      health,
      callStartedAt,
    };
  } finally {
    clearTimeout(stallTimer);
  }
}
