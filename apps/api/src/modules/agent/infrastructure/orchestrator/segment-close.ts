import type { ModelPricing } from '@jovandyaz/ai-gateway';

import { AGENT_STOP_REASON } from '@knowtis/shared-types';

import { TokenUsage } from '../../../ai/domain/value-objects/token-usage.vo';
import type { AgentMessage } from '../../domain/agent-message';
import { estimateMessageTokens } from '../../domain/message-tokens';
import { MIN_SYNTHESIS_OUTPUT_TOKENS } from '../../domain/synthesis-request';

export type SegmentEnd =
  | typeof AGENT_STOP_REASON.MAX_STEPS
  | typeof AGENT_STOP_REASON.TOKEN_BUDGET
  | typeof AGENT_STOP_REASON.TIME_LIMIT;

export interface SegmentState {
  readonly completedSteps: number;
  readonly maxSteps: number;
  readonly spentTurnTokens: number;
  readonly nextInputTokens: number;
  readonly synthesisRequestTokens: number;
  readonly maxTurnTokens: number;
  readonly reserveTokens: number;
  readonly now: number;
  readonly deadlineAt: number;
  readonly reserveMs: number;
  readonly spentTurnCostUsd: number;
  readonly maxTurnCostUsd: number;
  /** The model the next call runs on, whose prices the USD budget reads. */
  readonly model: string;
  readonly pricing: ModelPricing | undefined;
  /** Input of the next call the provider already holds in its cache. */
  readonly cachedInputTokens: number;
}

function hasTokenPrices(pricing: ModelPricing | undefined): boolean {
  return (
    pricing?.inputCostPerToken !== undefined ||
    pricing?.outputCostPerToken !== undefined
  );
}

// Every call re-sends the whole history, so one more tool step costs about
// nextInput and the synthesis after it about nextInput plus its request; the
// reserve covers that step's typical output and tool results plus the synthesis,
// so a step with a full output or large tool results can leave the synthesis
// unaffordable. Negated so a NaN
// anywhere closes the segment instead of running unbudgeted.
function tokensRunOut(state: SegmentState): boolean {
  return !(
    state.spentTurnTokens +
      2 * state.nextInputTokens +
      state.synthesisRequestTokens +
      state.reserveTokens <=
    state.maxTurnTokens
  );
}

// The reservation tokensRunOut makes, at the prices usage is billed: the next
// tool step reads back what the last call cached, a tool-less synthesis reads no
// cache, and the reserve sits at the output rate, the dearest thing it may buy.
// A model without token prices sits this out, leaving it to the token budget.
/** Whether one more tool step and the synthesis after it would pass the USD budget on this model. */
export function costRunsOut(state: SegmentState): boolean {
  if (!hasTokenPrices(state.pricing)) {
    return false;
  }
  const toolStepUsd = TokenUsage.create(
    {
      inputTokens: state.nextInputTokens,
      outputTokens: 0,
      model: state.model,
      cacheReadTokens: state.cachedInputTokens,
    },
    state.pricing
  ).costUsd;
  const synthesisUsd = TokenUsage.create(
    {
      inputTokens: state.nextInputTokens + state.synthesisRequestTokens,
      outputTokens: state.reserveTokens,
      model: state.model,
    },
    state.pricing
  ).costUsd;
  return !(
    state.spentTurnCostUsd + toolStepUsd + synthesisUsd <=
    state.maxTurnCostUsd
  );
}

/** After a step that asked for more tools: why the next call must be the synthesis, or null to run another tool step. */
export function segmentEndAfterToolStep(
  state: SegmentState
): SegmentEnd | null {
  // The USD cap reports token_budget too: the client words that reason as "the
  // turn budget", and a reason of its own would take a CHECK migration and new
  // copy without changing what the client does.
  if (tokensRunOut(state) || costRunsOut(state)) {
    return AGENT_STOP_REASON.TOKEN_BUDGET;
  }
  if (state.now >= state.deadlineAt - state.reserveMs) {
    return AGENT_STOP_REASON.TIME_LIMIT;
  }
  if (state.completedSteps + 1 >= state.maxSteps) {
    return AGENT_STOP_REASON.MAX_STEPS;
  }
  return null;
}

/** Output tokens the synthesis may spend without the turn passing its budget; 0 when not even a minimal answer fits, or when the room is NaN. */
export function synthesisOutputCap(
  state: Pick<
    SegmentState,
    | 'spentTurnTokens'
    | 'nextInputTokens'
    | 'synthesisRequestTokens'
    | 'maxTurnTokens'
  >,
  maxOutputTokens: number
): number {
  const room =
    state.maxTurnTokens -
    state.spentTurnTokens -
    state.nextInputTokens -
    state.synthesisRequestTokens;
  return !(room >= MIN_SYNTHESIS_OUTPUT_TOKENS)
    ? 0
    : Math.min(maxOutputTokens, room);
}

/** Output tokens the synthesis may spend without the turn passing its USD budget; 0 when not even a minimal answer fits, unbounded on a model without token prices. */
export function synthesisCostOutputCap(state: SegmentState): number {
  if (!hasTokenPrices(state.pricing)) {
    return Number.POSITIVE_INFINITY;
  }
  const inputUsd = TokenUsage.create(
    {
      inputTokens: state.nextInputTokens + state.synthesisRequestTokens,
      outputTokens: 0,
      model: state.model,
    },
    state.pricing
  ).costUsd;
  const room = state.maxTurnCostUsd - state.spentTurnCostUsd - inputUsd;
  const tokens = Math.floor(room / (state.pricing?.outputCostPerToken ?? 0));
  return !(tokens >= MIN_SYNTHESIS_OUTPUT_TOKENS) ? 0 : tokens;
}

/** Output tokens the closing synthesis may spend within both budgets. */
export function closingSynthesisCap(
  state: SegmentState,
  maxOutputTokens: number
): number {
  return Math.min(
    synthesisOutputCap(state, maxOutputTokens),
    synthesisCostOutputCap(state)
  );
}

/** The next call's input: history only grows, so the last call's input plus its answer and the tool results it appended. */
export function nextInputTokens(
  lastInputTokens: number | undefined,
  lastOutputTokens: number | undefined,
  stepMessages: readonly AgentMessage[]
): number {
  const toolTokens = stepMessages
    .filter((m) => m.role === 'tool')
    .reduce((total, m) => total + estimateMessageTokens(m), 0);
  return (lastInputTokens ?? 0) + (lastOutputTokens ?? 0) + toolTokens;
}
