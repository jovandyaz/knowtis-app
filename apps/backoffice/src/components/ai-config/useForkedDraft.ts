import { useState } from 'react';

/**
 * A local edit forked from a server-owned base value. The draft survives
 * re-renders only while `base` still matches what it forked from; any outside
 * change to `base` — another admin's write landing — drops the draft, because
 * saving over their change would silently revert it.
 */
export function useForkedDraft(base: string) {
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(
    null
  );

  const isForked = draft?.base === base;
  const value = isForked ? draft.value : base;
  return {
    value,
    isDirty: isForked && draft.value !== base,
    edit: (next: string) => setDraft({ base, value: next }),
    discard: () => setDraft(null),
  };
}
