import type { OrganizationSuggestion } from '@knowtis/shared-types';

import { httpClient } from './http-client';

export const organizationApi = {
  /**
   * Proposes a bucket and tags for notes the caller owns. Read-only: applying a
   * suggestion is a separate note update the client sends once the user accepts.
   */
  async suggest(noteIds: string[]): Promise<OrganizationSuggestion[]> {
    return httpClient.post<OrganizationSuggestion[]>(
      '/ai/organization/suggest',
      { noteIds }
    );
  },
};
