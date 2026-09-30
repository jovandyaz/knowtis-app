export interface FirstCallRoomInput {
  readonly maxTurnTokens: number;
  readonly maxOutputTokens: number;
  readonly synthesisReserveTokens: number;
  readonly promptOverheadTokens: number;
}

export interface FirstCallBudgetInput extends FirstCallRoomInput {
  readonly historyCap: number;
}

/**
 * Message tokens the turn's first call may carry so that call's full output
 * and a synthesis still fit `maxTurnTokens`; unbounded for a turn with no
 * token budget. Negated so a NaN refuses the turn instead of running it
 * unbudgeted.
 */
export function firstCallRoom(input: FirstCallRoomInput): number {
  const room =
    input.maxTurnTokens -
    input.promptOverheadTokens -
    input.maxOutputTokens -
    input.synthesisReserveTokens;
  return !(room > 0) ? 0 : room;
}

/** History tokens the turn's first call may replay: its {@link firstCallRoom}, capped at `historyCap`. */
export function firstCallHistoryBudget(input: FirstCallBudgetInput): number {
  return Math.min(input.historyCap, firstCallRoom(input));
}
