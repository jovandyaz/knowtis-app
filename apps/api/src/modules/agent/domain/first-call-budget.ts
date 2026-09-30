import {
  MIN_SYNTHESIS_OUTPUT_TOKENS,
  SYNTHESIS_REQUEST_TOKENS,
} from './synthesis-request';

/** Tokens a turn's first call carries besides its messages: the system prompt with its memories, and the tool definitions. */
export const AGENT_PROMPT_OVERHEAD_TOKENS = 1500;

export interface FirstCallCosts {
  readonly promptOverheadTokens: number;
  readonly synthesisRequestTokens: number;
  readonly minSynthesisOutputTokens: number;
}

export const AGENT_FIRST_CALL_COSTS: FirstCallCosts = {
  promptOverheadTokens: AGENT_PROMPT_OVERHEAD_TOKENS,
  synthesisRequestTokens: SYNTHESIS_REQUEST_TOKENS,
  minSynthesisOutputTokens: MIN_SYNTHESIS_OUTPUT_TOKENS,
};

export interface FirstCallRoomInput extends FirstCallCosts {
  readonly maxTurnTokens: number;
  readonly maxOutputTokens: number;
}

export interface FirstCallBudgetInput extends FirstCallRoomInput {
  readonly historyCap: number;
}

/**
 * Message tokens the turn's first call may carry so that, when it spends its
 * full `maxOutputTokens` on a tool step, the synthesis that re-sends its input
 * and output keeps `minSynthesisOutputTokens` of room as `synthesisOutputCap`
 * computes it: `2 × (overhead + messages + maxOutputTokens) + synthesis request
 * + minimum synthesis output ≤ maxTurnTokens`. That assumes the tool step
 * added no results; tool results beyond that are left to the existing
 * `synthesis_unaffordable` path. Unbounded for a turn with no token budget;
 * negated so a NaN refuses the turn instead of running it unbudgeted.
 */
export function firstCallRoom(input: FirstCallRoomInput): number {
  const perCall =
    (input.maxTurnTokens -
      input.synthesisRequestTokens -
      input.minSynthesisOutputTokens) /
    2;
  const room =
    Math.floor(perCall) - input.maxOutputTokens - input.promptOverheadTokens;
  return !(room > 0) ? 0 : room;
}

/** History tokens the turn's first call may replay: its {@link firstCallRoom}, capped at `historyCap`. */
export function firstCallHistoryBudget(input: FirstCallBudgetInput): number {
  return Math.min(input.historyCap, firstCallRoom(input));
}
