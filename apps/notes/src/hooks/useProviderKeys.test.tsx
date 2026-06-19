import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiKeysApi } from '@knowtis/api-client';

import {
  providerKeysQueryKeys,
  useProviderKeys,
  useSetProviderKey,
} from './useProviderKeys';

vi.mock('@knowtis/api-client', () => ({
  aiKeysApi: {
    list: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const mockKeys = [
  {
    provider: 'anthropic' as const,
    keyPrefix: 'sk-ant-***',
    lastUsedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

describe('useProviderKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the provider keys list when enabled', async () => {
    vi.mocked(aiKeysApi.list).mockResolvedValue(mockKeys);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProviderKeys(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockKeys);
    expect(aiKeysApi.list).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when disabled', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProviderKeys(false), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(aiKeysApi.list).not.toHaveBeenCalled();
  });
});

describe('useSetProviderKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls aiKeysApi.set with the correct provider and apiKey', async () => {
    vi.mocked(aiKeysApi.set).mockResolvedValue(mockKeys);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetProviderKey(), { wrapper });

    result.current.mutate({ provider: 'anthropic', apiKey: 'sk-ant-test' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(aiKeysApi.set).toHaveBeenCalledWith('anthropic', 'sk-ant-test');
  });

  it('seeds the cache with the returned masked list on success', async () => {
    vi.mocked(aiKeysApi.set).mockResolvedValue(mockKeys);
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useSetProviderKey(), { wrapper });

    result.current.mutate({ provider: 'anthropic', apiKey: 'sk-ant-test' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(providerKeysQueryKeys.list())).toEqual(
      mockKeys
    );
  });
});
