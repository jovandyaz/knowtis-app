import { Logger } from '@nestjs/common';
import type { ModelMessage, TelemetrySettings, ToolSet } from 'ai';

import { isAbortError } from '@knowtis/ai-gateway';

import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import { ProviderRegistryFactory } from '../../../ai/infrastructure/providers/provider-registry.factory';
import type { AgentEvent, AgentSource } from '../../domain/agent-event';
import type { AgentRunInput } from '../../domain/ports/agent-orchestrator.port';
import { openrouterProviderOptions } from './openrouter-options';
import { ProposalCollector } from './proposal-collector';
import {
  errorEvent,
  errorMessage,
  runStepCall,
  STEP_CALL_KIND,
  toError,
  type TurnState,
} from './step-call';
import {
  AGENT_TURN_OUTCOME,
  emitTurnHealth,
  type StreamHealth,
} from './stream-health';
import {
  accumulateTurnUsage,
  bestEffortUsage,
  turnUsageEvent,
  type StepUsageAccumulator,
  type TurnUsageAccumulator,
} from './turn-usage';
import { WebSourceCollector } from './web-source.collector';

const MAX_STEP_ATTEMPTS = 2;

const FINISH_REASON_LENGTH = 'length';
const FINISH_REASON_TOOL_CALLS = 'tool-calls';

class AgentStallError extends Error {
  constructor(stallMs: number) {
    super(`No stream activity for ${stallMs}ms`);
    this.name = 'AgentStallError';
  }
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

function canRetrySilentStep(health: StreamHealth, attempt: number): boolean {
  return health.parts === 0 && attempt + 1 < MAX_STEP_ATTEMPTS;
}

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
 * Runs a turn as one streamText call per step, threading each call's messages
 * into history. Yields `thinking`/`chunk` then one terminal event
 * (`done`/`proposal`/`aborted`/`error`); throws `AgentStallError` to advance the
 * fallback chain on a fresh first-call stall.
 */
export async function* runAgentStepLoop(
  params: AgentStepLoopParams
): AsyncGenerator<AgentEvent> {
  const { input, model, logger } = params;
  const { stallMs } = params.budgets;
  const byok = Boolean(input.byokApiKey);
  const providerOptions = openrouterProviderOptions(
    model,
    input.reasoningEffort,
    input.openrouterProviderOrder
  );

  const history: ModelMessage[] = [...params.initialMessages];
  const turn: TurnState = {
    progressed: false,
    textDeltas: 0,
    stepUsage: { inputTokens: 0, outputTokens: 0 },
    sources: params.sources,
    knownNotes: params.knownNotes,
  };
  const turnUsage: TurnUsageAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let completedSteps = 0;

  while (completedSteps < input.maxSteps) {
    let advanceToNextStep = false;

    stepAttempts: for (
      let attempt = 0;
      attempt < MAX_STEP_ATTEMPTS;
      attempt++
    ) {
      const result = yield* runStepCall({
        logger,
        input,
        model,
        providerRegistry: params.providerRegistry,
        abortSignal: params.abortSignal,
        timeoutSignal: params.timeoutSignal,
        system: params.system,
        cache: params.cache,
        tools: params.tools,
        telemetry: params.telemetry,
        providerOptions,
        history,
        budgets: params.budgets,
        turn,
      });

      switch (result.kind) {
        case STEP_CALL_KIND.INTERRUPTED: {
          emitTurnHealth(
            logger,
            input.userId,
            model,
            result.health,
            input.signal?.aborted
              ? AGENT_TURN_OUTCOME.ABORTED
              : AGENT_TURN_OUTCOME.TIMEOUT,
            result.callStartedAt
          );
          yield result.event;
          return;
        }
        case STEP_CALL_KIND.STALLED: {
          emitTurnHealth(
            logger,
            input.userId,
            model,
            result.health,
            AGENT_TURN_OUTCOME.STALL,
            result.callStartedAt
          );
          if (canRetrySilentStep(result.health, attempt)) {
            logRetry(logger, input.userId, model, attempt + 1);
            continue;
          }
          yield stallOutcome(
            input,
            model,
            turn.stepUsage,
            turn.progressed,
            params.throwOnFreshFailure,
            stallMs,
            logger
          );
          return;
        }
        case STEP_CALL_KIND.ERRORED: {
          const { cause, fromStream } = result;
          const throwFreshFailure = fromStream
            ? params.throwOnFreshFailure &&
              !turn.progressed &&
              !isAbortError(cause)
            : params.throwOnFreshFailure && !isAbortError(cause);
          if (throwFreshFailure) {
            emitTurnHealth(
              logger,
              input.userId,
              model,
              result.health,
              AGENT_TURN_OUTCOME.ERROR,
              result.callStartedAt
            );
            throw cause;
          }
          if (fromStream) {
            logger.error({
              event: 'agent.run.error',
              userId: input.userId,
              model,
              error: errorMessage(cause, byok),
            });
          }
          emitTurnHealth(
            logger,
            input.userId,
            model,
            result.health,
            AGENT_TURN_OUTCOME.ERROR,
            result.callStartedAt
          );
          yield errorEvent(
            toError(cause, byok),
            fromStream ? bestEffortUsage(model, turn.stepUsage) : undefined
          );
          return;
        }
        case STEP_CALL_KIND.COMPLETED: {
          accumulateTurnUsage(turnUsage, result.usage);
          const captured = params.proposals.captured;
          if (captured) {
            emitTurnHealth(
              logger,
              input.userId,
              model,
              result.health,
              AGENT_TURN_OUTCOME.PROPOSAL,
              result.callStartedAt
            );
            yield {
              type: 'proposal',
              proposal: captured,
              usage: turnUsageEvent(turnUsage, model),
            };
            return;
          }
          const willContinue =
            result.finishReason === FINISH_REASON_TOOL_CALLS &&
            completedSteps + 1 < input.maxSteps;
          if (willContinue) {
            emitTurnHealth(
              logger,
              input.userId,
              model,
              result.health,
              AGENT_TURN_OUTCOME.CONTINUED,
              result.callStartedAt
            );
            const { messages } = await result.response;
            history.push(...messages);
            advanceToNextStep = true;
            break stepAttempts;
          }
          if (
            turn.textDeltas === 0 &&
            result.finishReason === FINISH_REASON_LENGTH
          ) {
            emitTurnHealth(
              logger,
              input.userId,
              model,
              result.health,
              AGENT_TURN_OUTCOME.EMPTY,
              result.callStartedAt
            );
            yield errorEvent(
              AIErrors.emptyCompletion(),
              turnUsageEvent(turnUsage, model)
            );
            return;
          }
          emitTurnHealth(
            logger,
            input.userId,
            model,
            result.health,
            turn.textDeltas > 0
              ? AGENT_TURN_OUTCOME.DONE
              : AGENT_TURN_OUTCOME.EMPTY,
            result.callStartedAt
          );
          yield {
            type: 'done',
            usage: turnUsageEvent(turnUsage, model),
            sources: [...params.sources.values()],
            knownNotes: [...params.knownNotes.values()],
            webSources: params.webSources.all,
          };
          return;
        }
        default: {
          const _exhaustive: never = result;
          throw new Error(`Unhandled step call result: ${String(_exhaustive)}`);
        }
      }
    }

    if (advanceToNextStep) {
      completedSteps += 1;
      continue;
    }
    return;
  }
}
