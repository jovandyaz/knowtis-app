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
import {
  createHealth,
  openrouterUpstreamOf,
  STREAM_MARKER_PART_TYPES,
  type StreamHealth,
} from './stream-health';
import { collectKnownNotes, collectSources } from './turn-collectors';
import { bestEffortUsage, type StepUsageAccumulator } from './turn-usage';

const AGENT_TEMPERATURE = 0.7;
const TOOL_ERROR_LOG_MAX_CHARS = 300;

export function errorMessage(error: unknown, redact: boolean): string {
  if (redact) {
    return 'BYOK provider request failed';
  }
  return error instanceof Error ? error.message : 'Agent run failed';
}

function describeToolError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'non-Error value thrown';
  return message.slice(0, TOOL_ERROR_LOG_MAX_CHARS);
}

export function toError(error: unknown, redact = false) {
  if (isOverloadedError(error)) {
    return AIErrors.providerOverloaded();
  }
  return AIErrors.providerError(errorMessage(error, redact));
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
  readonly telemetry: TelemetryOptions;
  readonly traceIdentity: TraceIdentityAttrs;
  readonly providerOptions: TurnProviderOptions;
  readonly history: ModelMessage[];
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
    });

/**
 * Runs one streamText attempt: yields `thinking`/`chunk` and returns a
 * `StepCallResult` via `yield*`. Never logs health.
 */
export async function* runStepCall(
  params: StepCallParams
): AsyncGenerator<AgentEvent, StepCallResult> {
  const { logger, input, model, turn } = params;
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
    result = withTraceIdentity(params.traceIdentity, () =>
      streamText({
        model: params.providerRegistry.languageModel(model, input.byokApiKey),
        ...(params.cache
          ? cacheableInstructions(model, params.instructions)
          : { instructions: params.instructions }),
        messages: params.cache
          ? withLastMessageCache(model, params.history)
          : params.history,
        tools: params.tools,
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

  try {
    armStallTimer();
    for await (const part of result.stream) {
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
            turn.progressed = true;
            health.textDeltas += 1;
            turn.textDeltas += 1;
            yield { type: 'chunk', text: part.text };
          }
          break;
        case 'tool-call':
          health.toolCalls += 1;
          break;
        case 'tool-error':
          health.toolErrors += 1;
          logger.warn({
            event: 'agent.tool.error',
            userId: input.userId,
            model,
            toolName: part.toolName,
            error: describeToolError(part.error),
          });
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
    if (stalled) {
      return { kind: STEP_CALL_KIND.STALLED, health, callStartedAt };
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
