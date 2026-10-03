import {
  REASONING_EFFORTS,
  type ModelReasoning,
  type ReasoningEffort,
} from '@knowtis/shared-types';

export type EffortAudience = 'anonymous' | 'free' | 'byok';

/** Highest effort a server-billed (free-audience) turn may boost to. */
export const FREE_BOOST_CEILING: ReasoningEffort = 'high';

/**
 * The level a call sent without its tools is lowered to. Reasoning shares the
 * output cap with the answer, which a synthesis may get little of. Lowered,
 * never turned off: Opus and Sonnet 5.5 reject disabled thinking, and
 * mandatory-reasoning OpenRouter models reject effort none. Only on such a
 * call, which already misses the prompt cache; on a native call a changed
 * effort would cost the cached prefix too.
 */
export const TOOL_FREE_REASONING_EFFORT: ReasoningEffort = 'low';

/** The levels one model runs a turn's calls at. */
export interface TurnEffort {
  /** Every call except one sent without its tools. */
  readonly step: ReasoningEffort;
  /** A call sent without its tools. */
  readonly toolFree: ReasoningEffort;
}

function rank(effort: ReasoningEffort): number {
  return REASONING_EFFORTS.indexOf(effort);
}

/** The listed level nearest `effort` in effort order; a tie settles on the lower level, so a mapped level never spends more than it must. Undefined for an empty ladder. */
export function nearestEffort(
  effort: ReasoningEffort,
  levels: readonly ReasoningEffort[]
): ReasoningEffort | undefined {
  const distance = (level: ReasoningEffort) =>
    Math.abs(rank(level) - rank(effort));
  return levels.reduce<ReasoningEffort | undefined>((best, level) => {
    if (best === undefined || distance(level) < distance(best)) {
      return level;
    }
    return distance(level) === distance(best) && rank(level) < rank(best)
      ? level
      : best;
  }, undefined);
}

/** The level a call sent without its tools runs at on a route with this ladder: `TOOL_FREE_REASONING_EFFORT` when listed, else the lowest listed level, so it never leaves the ladder. An unknown ladder keeps `TOOL_FREE_REASONING_EFFORT`. */
export function toolFreeEffort(
  levels: readonly ReasoningEffort[] | undefined
): ReasoningEffort {
  if (!levels?.length || levels.includes(TOOL_FREE_REASONING_EFFORT)) {
    return TOOL_FREE_REASONING_EFFORT;
  }
  return levels.reduce((lowest, level) =>
    rank(level) < rank(lowest) ? level : lowest
  );
}

/** The declared levels a server-billed turn may run at: everything at or below the free ceiling. */
export function freeLevels(
  levels: readonly ReasoningEffort[]
): ReasoningEffort[] {
  return levels.filter((level) => rank(level) <= rank(FREE_BOOST_CEILING));
}

/**
 * Returns the effort the turn may run at, or null when the request must fall
 * back to the global default. A server-billed request above the free ceiling is
 * lowered to the highest declared level within it. Anonymous requests are
 * rejected by the caller before this runs.
 */
export function clampEffort(
  requested: ReasoningEffort,
  declared: ModelReasoning | null | undefined,
  audience: Exclude<EffortAudience, 'anonymous'>
): ReasoningEffort | null {
  if (!declared || declared.levels.length === 0) {
    return null;
  }
  if (audience === 'byok') {
    return declared.levels.includes(requested) ? requested : null;
  }
  const eligible = freeLevels(declared.levels);
  if (eligible.length === 0) {
    return null;
  }
  if (eligible.includes(requested)) {
    return requested;
  }
  if (rank(requested) <= rank(FREE_BOOST_CEILING)) {
    return null;
  }
  return eligible.reduce((best, level) =>
    rank(level) > rank(best) ? level : best
  );
}
