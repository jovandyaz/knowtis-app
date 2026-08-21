import type { OrganizationSuggestion } from '@knowtis/shared-types';

import { httpClient } from './http-client';

export const organizationApi = {
  async suggest(noteIds: string[]): Promise<OrganizationSuggestion[]> {
    return httpClient.post<OrganizationSuggestion[]>(
      '/ai/organization/suggest',
      { noteIds }
    );
  },
};
