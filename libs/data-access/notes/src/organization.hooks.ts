import { useMutation } from '@tanstack/react-query';

import { organizationApi } from '@knowtis/api-client';

/**
 * Asks for suggestions. Nothing is cached: a suggestion is a proposal about the
 * note's current content, so a stale one is worse than none.
 */
export function useSuggestOrganization() {
  return useMutation({
    mutationFn: (noteIds: string[]) => organizationApi.suggest(noteIds),
  });
}
