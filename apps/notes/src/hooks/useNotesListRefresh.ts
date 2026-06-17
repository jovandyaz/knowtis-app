import { useQueryClient } from '@tanstack/react-query';

import { DEBOUNCE_DELAYS } from '@/lib';

import { notesQueryKeys } from '@knowtis/data-access-notes';
import { useDebouncedCallback } from '@knowtis/shared-hooks';

/** Returns a debounced callback that marks the notes-list query stale. */
export function useNotesListRefresh(): () => void {
  const queryClient = useQueryClient();
  return useDebouncedCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
  }, DEBOUNCE_DELAYS.AUTO_SAVE);
}
