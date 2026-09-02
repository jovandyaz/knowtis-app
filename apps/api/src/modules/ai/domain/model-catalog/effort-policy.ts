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

/**
 * Returns the effort the turn may run at, or null when the request must fall
 * back to the global default. Anonymous requests are rejected by the caller
 * before this runs.
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
  // The free pill sends a fixed 'high' sentinel; the model's declaration, not
  // the request, decides the level so an undeclared 'high' can't sneak through.
  const eligible = declared.levels.filter(
    (level) => rank(level) <= rank(FREE_BOOST_CEILING)
  );
  if (eligible.length === 0) {
    return null;
  }
  return eligible.reduce((best, level) =>
    rank(level) > rank(best) ? level : best
  );
}
