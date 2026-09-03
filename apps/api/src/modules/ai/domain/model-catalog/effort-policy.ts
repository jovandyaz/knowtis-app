import {
  REASONING_EFFORTS,
  type ModelReasoning,
  type ReasoningEffort,
} from '@knowtis/shared-types';

export type EffortAudience = 'anonymous' | 'free' | 'byok';

/** Highest effort a server-billed (free-audience) turn may boost to. */
export const FREE_BOOST_CEILING: ReasoningEffort = 'high';

function rank(effort: ReasoningEffort): number {
  return REASONING_EFFORTS.indexOf(effort);
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
