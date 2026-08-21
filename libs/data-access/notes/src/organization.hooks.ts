import { useMutation } from '@tanstack/react-query';

import { organizationApi } from '@knowtis/api-client';

export function useSuggestOrganization() {
  return useMutation({
    mutationFn: (noteIds: string[]) => organizationApi.suggest(noteIds),
  });
}
