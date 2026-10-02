import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiQuota } from '@knowtis/shared-types';

import { aiQuotaApi } from './ai-quota.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn() },
}));

describe('aiQuotaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getQuota hits GET /ai/quota and returns the body', async () => {
    const quota = { tier: 'free', messages: {} } as unknown as AiQuota;
    vi.mocked(httpClient.get).mockResolvedValue(quota);

    await expect(aiQuotaApi.getQuota()).resolves.toBe(quota);
    expect(httpClient.get).toHaveBeenCalledWith('/ai/quota');
  });

  it('getQuota propagates http errors', async () => {
    vi.mocked(httpClient.get).mockRejectedValueOnce(new Error('network'));
    await expect(aiQuotaApi.getQuota()).rejects.toThrow('network');
  });
});
