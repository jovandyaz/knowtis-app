import type { AiQuota } from '@knowtis/shared-types';

import { httpClient } from './http-client';

export const aiQuotaApi = {
  getQuota(): Promise<AiQuota> {
    return httpClient.get<AiQuota>('/ai/quota');
  },
};
