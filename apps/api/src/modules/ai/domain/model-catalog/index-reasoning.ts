import type { IndexedReasoning } from '@knowtis/ai-gateway';
import { REASONING_EFFORTS, type ModelReasoning } from '@knowtis/shared-types';

/** The effort level that means reasoning can be switched off. */
export const OPTIONAL_EFFORT_LEVEL = 'none';

/** The index ladder as the picker and `clampEffort` read it: only `REASONING_EFFORTS`, in their order; `none` makes it optional. Undefined when no level survives. */
export function toModelReasoning(
  reasoning: IndexedReasoning | null
): ModelReasoning | undefined {
  if (reasoning === null) {
    return undefined;
  }
  const levels = REASONING_EFFORTS.filter((level) =>
    reasoning.levels.includes(level)
  );
  if (levels.length === 0) {
    return undefined;
  }
  return {
    levels,
    mandatory:
      reasoning.mandatory && !reasoning.levels.includes(OPTIONAL_EFFORT_LEVEL),
  };
}
