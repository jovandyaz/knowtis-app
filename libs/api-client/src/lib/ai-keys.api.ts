import type { ByokProvider, ProviderKeyInfo } from '@knowtis/shared-types';

import { httpClient } from './http-client';

export const aiKeysApi = {
  list(): Promise<ProviderKeyInfo[]> {
    return httpClient.get<ProviderKeyInfo[]>('/ai/keys');
  },
  set(provider: ByokProvider, apiKey: string): Promise<ProviderKeyInfo[]> {
    return httpClient.put<ProviderKeyInfo[]>(
      `/ai/keys/${encodeURIComponent(provider)}`,
      { apiKey }
    );
  },
  async remove(provider: ByokProvider): Promise<void> {
    await httpClient.delete(`/ai/keys/${encodeURIComponent(provider)}`);
  },
};
