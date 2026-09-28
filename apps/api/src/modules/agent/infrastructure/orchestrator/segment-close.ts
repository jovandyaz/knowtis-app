import { AGENT_STOP_REASON } from '@knowtis/shared-types';

import type { AgentMessage } from '../../domain/agent-message';
import { estimateMessageTokens } from '../../domain/message-tokens';

export type SegmentEnd =
  | typeof AGENT_STOP_REASON.MAX_STEPS
  | typeof AGENT_STOP_REASON.TOKEN_BUDGET
  | typeof AGENT_STOP_REASON.TIME_LIMIT;

export const MIN_SYNTHESIS_OUTPUT_TOKENS = 1024;

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
}

// Every call re-sends the whole history, so one more tool step costs about
// nextInput and the synthesis after it about nextInput plus its request; the
// reserve covers both calls' output and the tool results in between. Negated
// so a NaN anywhere closes the segment instead of running unbudgeted.
function tokensRunOut(state: SegmentState): boolean {
  return !(
    state.spentTurnTokens +
      2 * state.nextInputTokens +
      state.synthesisRequestTokens +
      state.reserveTokens <=
    state.maxTurnTokens
  );
}

/** After a step that asked for more tools: why the next call must be the synthesis, or null to run another tool step. */
export function segmentEndAfterToolStep(
  state: SegmentState
): SegmentEnd | null {
  if (tokensRunOut(state)) {
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
