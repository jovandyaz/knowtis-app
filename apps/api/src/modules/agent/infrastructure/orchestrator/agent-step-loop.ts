import { Logger } from '@nestjs/common';
import {
  pruneMessages,
  type ModelMessage,
  type TelemetryOptions,
  type ToolSet,
} from 'ai';

import {
  cooldownKeyOf,
  isAbortError,
  isOverloadedError,
  providerOf,
  type ProviderCooldown,
} from '@knowtis/ai-gateway';
import { AGENT_STOP_REASON, type AgentStopReason } from '@knowtis/shared-types';

import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import { ProviderRegistryFactory } from '../../../ai/infrastructure/providers/provider-registry.factory';
import type { TraceIdentityAttrs } from '../../../ai/infrastructure/providers/trace-identity';
import { turnProviderOptions } from '../../../ai/infrastructure/providers/turn-provider-options';
import type { AgentEvent, AgentSource } from '../../domain/agent-event';
import { estimateMessageTokens } from '../../domain/message-tokens';
import type { AgentRunInput } from '../../domain/ports/agent-orchestrator.port';
import { fromResponseMessages } from './message-mapper';
import { ProposalCollector } from './proposal-collector';
import {
  nextInputTokens,
  segmentEndAfterToolStep,
  synthesisOutputCap,
  type SegmentEnd,
  type SegmentState,
} from './segment-close';
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
  hasCompleteUsage,
  turnUsageEvent,
  type StepUsageAccumulator,
  type TurnUsageAccumulator,
} from './turn-usage';
import { WebSourceCollector } from './web-source.collector';

const MAX_STEP_ATTEMPTS = 2;

const FINISH_REASON_LENGTH = 'length';
const FINISH_REASON_TOOL_CALLS = 'tool-calls';
const FINISH_REASON_CONTENT_FILTER = 'content-filter';

// Appended to the synthesis call's prompt only; never threaded into history,
// so it is not persisted and a continuation does not replay it.
export const SYNTHESIS_REQUEST =
  '(Stop using tools now: this part of the task has reached its limit. Reply in the same language I used in my request above — not the language of this instruction or of any note or web page you read — with what you found so far, then, under a short heading, list what is still pending so it can be continued.)';

const SYNTHESIS_REQUEST_TOKENS = estimateMessageTokens({
  role: 'user',
  content: SYNTHESIS_REQUEST,
});

class AgentStallError extends Error {
  constructor(stallMs: number) {
    super(`No stream activity for ${stallMs}ms`);
    this.name = 'AgentStallError';
  }
}

type StepRetryReason = 'ttft' | 'transient';

function logRetry(
  logger: Logger,
  userId: string,
  model: string,
  attempt: number,
  reason: StepRetryReason
): void {
  logger.warn({
    event: 'agent.turn.retry',
    userId,
    model,
    attempt,
    reason,
  });
}

function canRetrySilentStep(health: StreamHealth, attempt: number): boolean {
  return health.parts === 0 && attempt + 1 < MAX_STEP_ATTEMPTS;
}

// A BYOK turn must never bill another key, so a 429/503 gets one more shot on
// the same key and model instead of failing over. Only before anything reached
// the client, so nothing streamed is duplicated. No backoff here: the retried
// step re-enters streamText, whose maxRetries backs off exponentially within
// each call.
function canRetryTransientStep(
  health: StreamHealth,
  attempt: number,
  cause: unknown,
  byok: boolean
): boolean {
  return (
    byok &&
    health.parts === 0 &&
    attempt + 1 < MAX_STEP_ATTEMPTS &&
    isOverloadedError(cause) &&
    !isAbortError(cause)
  );
}

function eligibleForStepFailover(
  health: StreamHealth,
  completedSteps: number,
  byok: boolean,
  failoverCandidates: readonly string[]
): boolean {
  return (
    completedSteps > 0 &&
    health.parts === 0 &&
    !byok &&
    failoverCandidates.length > 0
  );
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
  const { userId } = input.execution.subject;
  logger.warn({
    event: 'agent.turn.stall',
    userId,
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
  readonly stepFailoverCandidates: readonly string[];
  readonly onModelSettled?: ((model: string) => void) | undefined;
  readonly cooldown: ProviderCooldown;
  readonly instructions: string;
  readonly cache: boolean;
  readonly tools: ToolSet;
  readonly telemetry: TelemetryOptions;
  readonly traceIdentity: TraceIdentityAttrs;
  readonly initialMessages: ModelMessage[];
  readonly budgets: {
    readonly stallMs: number;
    readonly ttftMs: number;
    readonly maxOutputTokens: number;
    readonly maxRetries: number;
    readonly maxMs: number;
    readonly maxTurnTokens: number;
    readonly synthesisReserveTokens: number;
    readonly synthesisReserveMs: number;
    readonly deadlineAt: number;
  };
  readonly sources: Map<string, AgentSource>;
  readonly knownNotes: Map<string, AgentSource>;
  readonly proposals: ProposalCollector;
  readonly webSources: WebSourceCollector;
}

/**
 * Runs a turn as one streamText call per step, threading each call's messages
 * into history; a first-call stall throws, a dead continuation fails over.
 */
export async function* runAgentStepLoop(
  params: AgentStepLoopParams
): AsyncGenerator<AgentEvent> {
  const { input, logger } = params;
  const { userId } = input.execution.subject;
  const { stallMs } = params.budgets;
  const byok = Boolean(input.byokApiKey);

  const optionsFor = async (model: string) =>
    turnProviderOptions({
      model,
      reasoningEffort: await input.effortFor?.(model),
      providerOrder: input.openrouterProviderOrder,
      ignoredProviders: input.openrouterIgnoredProviders,
    });

  let currentModel = params.model;
  let providerOptions = await optionsFor(currentModel);
  const modelsUsed: string[] = [currentModel];
  const failoverCandidates = [...params.stepFailoverCandidates];

  let history: ModelMessage[] = [...params.initialMessages];
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
  let segmentEnd: SegmentEnd | null = null;
  let synthesisMaxOutputTokens = params.budgets.maxOutputTokens;

  while (completedSteps < input.maxSteps) {
    let advanceToNextStep = false;
    let failedOver = false;

    stepAttempts: for (
      let attempt = 0;
      attempt < MAX_STEP_ATTEMPTS;
      attempt++
    ) {
      const synthesizing = segmentEnd !== null;
      const result = yield* runStepCall({
        logger,
        input,
        model: currentModel,
        providerRegistry: params.providerRegistry,
        abortSignal: params.abortSignal,
        timeoutSignal: params.timeoutSignal,
        instructions: params.instructions,
        cache: params.cache,
        tools: params.tools,
        ...(synthesizing || completedSteps + 1 === input.maxSteps
          ? { toolChoice: 'none' as const }
          : {}),
        telemetry: params.telemetry,
        traceIdentity: params.traceIdentity,
        providerOptions,
        history,
        ...(synthesizing
          ? { trailingMessage: { role: 'user', content: SYNTHESIS_REQUEST } }
          : {}),
        budgets: synthesizing
          ? { ...params.budgets, maxOutputTokens: synthesisMaxOutputTokens }
          : params.budgets,
        turn,
      });

      switch (result.kind) {
        case STEP_CALL_KIND.INTERRUPTED: {
          emitTurnHealth(
            logger,
            userId,
            currentModel,
            result.health,
            input.signal?.aborted
              ? AGENT_TURN_OUTCOME.ABORTED
              : AGENT_TURN_OUTCOME.TIMEOUT,
            result.callStartedAt,
            modelsUsed
          );
          yield result.event;
          return;
        }
        case STEP_CALL_KIND.STALLED: {
          emitTurnHealth(
            logger,
            userId,
            currentModel,
            result.health,
            AGENT_TURN_OUTCOME.STALL,
            result.callStartedAt,
            modelsUsed
          );
          if (canRetrySilentStep(result.health, attempt)) {
            logRetry(logger, userId, currentModel, attempt + 1, 'ttft');
            continue;
          }
          const nextModel = eligibleForStepFailover(
            result.health,
            completedSteps,
            byok,
            failoverCandidates
          )
            ? failoverCandidates.shift()
            : undefined;
          if (nextModel !== undefined) {
            params.cooldown.recordFailure(cooldownKeyOf(currentModel));
            logger.warn({
              event: 'ai.chain.step_failed',
              model: currentModel,
              provider: providerOf(currentModel),
              nextModel,
              atStep: completedSteps,
              reason: 'continuation stall',
            });
            currentModel = nextModel;
            params.onModelSettled?.(currentModel);
            providerOptions = await optionsFor(currentModel);
            modelsUsed.push(currentModel);
            history = pruneMessages({ messages: history, reasoning: 'all' });
            failedOver = true;
            break stepAttempts;
          }
          yield stallOutcome(
            input,
            currentModel,
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
          if (canRetryTransientStep(result.health, attempt, cause, byok)) {
            emitTurnHealth(
              logger,
              userId,
              currentModel,
              result.health,
              AGENT_TURN_OUTCOME.ERROR,
              result.callStartedAt,
              modelsUsed
            );
            logRetry(logger, userId, currentModel, attempt + 1, 'transient');
            continue;
          }
          const throwFreshFailure =
            params.throwOnFreshFailure &&
            !turn.progressed &&
            !isAbortError(cause);
          if (throwFreshFailure) {
            emitTurnHealth(
              logger,
              userId,
              currentModel,
              result.health,
              AGENT_TURN_OUTCOME.ERROR,
              result.callStartedAt,
              modelsUsed
            );
            throw cause;
          }
          if (fromStream) {
            logger.error({
              event: 'agent.run.error',
              userId,
              model: currentModel,
              error: errorMessage(cause, byok),
            });
          }
          emitTurnHealth(
            logger,
            userId,
            currentModel,
            result.health,
            AGENT_TURN_OUTCOME.ERROR,
            result.callStartedAt,
            modelsUsed
          );
          yield errorEvent(
            toError(cause, byok),
            fromStream
              ? bestEffortUsage(currentModel, turn.stepUsage)
              : undefined
          );
          return;
        }
        case STEP_CALL_KIND.COMPLETED: {
          accumulateTurnUsage(turnUsage, result.usage);
          if (!hasCompleteUsage(result.usage)) {
            logger.warn({
              event: 'agent.turn.usage_incomplete',
              userId,
              model: currentModel,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            });
          }
          const { messages: stepMessages } = await result.response;
          const stepRows = fromResponseMessages(stepMessages);
          yield { type: 'step', messages: stepRows };
          const captured = params.proposals.captured;
          if (captured) {
            emitTurnHealth(
              logger,
              userId,
              currentModel,
              result.health,
              AGENT_TURN_OUTCOME.PROPOSAL,
              result.callStartedAt,
              modelsUsed
            );
            yield {
              type: 'proposal',
              proposal: captured,
              usage: turnUsageEvent(turnUsage, currentModel),
            };
            return;
          }
          const spentTurnTokens =
            turnUsage.inputTokens + turnUsage.outputTokens;
          const wantsMoreTools =
            result.finishReason === FINISH_REASON_TOOL_CALLS;
          const stepNumber = completedSteps + 1;
          if (
            wantsMoreTools &&
            segmentEnd === null &&
            stepNumber < input.maxSteps
          ) {
            const state: SegmentState = {
              completedSteps: stepNumber,
              maxSteps: input.maxSteps,
              spentTurnTokens,
              nextInputTokens: nextInputTokens(
                result.usage.inputTokens,
                result.usage.outputTokens,
                stepRows
              ),
              synthesisRequestTokens: SYNTHESIS_REQUEST_TOKENS,
              maxTurnTokens: params.budgets.maxTurnTokens,
              reserveTokens: params.budgets.synthesisReserveTokens,
              now: Date.now(),
              deadlineAt: params.budgets.deadlineAt,
              reserveMs: params.budgets.synthesisReserveMs,
            };
            const end = segmentEndAfterToolStep(state);
            const cap =
              end === null
                ? 0
                : synthesisOutputCap(state, params.budgets.maxOutputTokens);
            if (end === null || cap > 0) {
              emitTurnHealth(
                logger,
                userId,
                currentModel,
                result.health,
                AGENT_TURN_OUTCOME.CONTINUED,
                result.callStartedAt,
                modelsUsed
              );
              history.push(...stepMessages);
              if (end !== null) {
                segmentEnd = end;
                synthesisMaxOutputTokens = cap;
                logger.warn({
                  event: 'agent.turn.segment_closed',
                  userId,
                  model: currentModel,
                  reason: end,
                  completedSteps: stepNumber,
                  spentTurnTokens,
                  maxOutputTokens: cap,
                });
              }
              advanceToNextStep = true;
              break stepAttempts;
            }
            logger.warn({
              event: 'agent.turn.synthesis_unaffordable',
              userId,
              model: currentModel,
              reason: end,
              spentTurnTokens,
              nextInputTokens: state.nextInputTokens,
              maxTurnTokens: params.budgets.maxTurnTokens,
            });
            segmentEnd = end;
          }
          if (
            turn.textDeltas === 0 &&
            result.finishReason === FINISH_REASON_LENGTH
          ) {
            emitTurnHealth(
              logger,
              userId,
              currentModel,
              result.health,
              AGENT_TURN_OUTCOME.EMPTY,
              result.callStartedAt,
              modelsUsed
            );
            yield errorEvent(
              AIErrors.emptyCompletion(),
              turnUsageEvent(turnUsage, currentModel)
            );
            return;
          }
          let stopReason: AgentStopReason = AGENT_STOP_REASON.COMPLETED;
          if (result.finishReason === FINISH_REASON_CONTENT_FILTER) {
            stopReason = AGENT_STOP_REASON.CONTENT_FILTER;
            logger.warn({
              event: 'agent.turn.content_filtered',
              userId,
              model: currentModel,
            });
          } else if (segmentEnd !== null) {
            stopReason = segmentEnd;
          } else if (wantsMoreTools) {
            stopReason = AGENT_STOP_REASON.MAX_STEPS;
          } else if (result.finishReason === FINISH_REASON_LENGTH) {
            stopReason = AGENT_STOP_REASON.LENGTH;
            logger.warn({
              event: 'agent.turn.output_truncated',
              userId,
              model: currentModel,
              maxOutputTokens: params.budgets.maxOutputTokens,
            });
          }
          emitTurnHealth(
            logger,
            userId,
            currentModel,
            result.health,
            turn.textDeltas > 0
              ? AGENT_TURN_OUTCOME.DONE
              : AGENT_TURN_OUTCOME.EMPTY,
            result.callStartedAt,
            modelsUsed
          );
          yield {
            type: 'done',
            usage: turnUsageEvent(turnUsage, currentModel),
            sources: [...params.sources.values()],
            knownNotes: [...params.knownNotes.values()],
            webSources: params.webSources.all,
            stopReason,
          };
          return;
        }
        default: {
          const _exhaustive: never = result;
          throw new Error(`Unhandled step call result: ${String(_exhaustive)}`);
        }
      }
    }

    if (failedOver) {
      continue;
    }
    if (advanceToNextStep) {
      completedSteps += 1;
      continue;
    }
    return;
  }
}
