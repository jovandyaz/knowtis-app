import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiModelsApi } from '@knowtis/api-client';

import { useAISettings, useUpdateAISettings } from './useAISettings';
import { aiModelsQueryKeys } from './useAvailableModels';

vi.mock('@knowtis/api-client', () => ({
  aiModelsApi: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
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

describe('useAISettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the stored preference', async () => {
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue({
      preferredModel: 'openai:gpt-4o-mini',
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAISettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.preferredModel).toBe('openai:gpt-4o-mini');
  });
});

describe('useUpdateAISettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies an optimistic write before the server responds', async () => {
    vi.mocked(aiModelsApi.updatePreferences).mockResolvedValue({
      preferredModel: 'b',
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(aiModelsQueryKeys.preferences(), {
      preferredModel: 'a',
    });

    const { result } = renderHook(() => useUpdateAISettings(), { wrapper });
    result.current.mutate({ preferredModel: 'b' });

    await waitFor(() =>
      expect(queryClient.getQueryData(aiModelsQueryKeys.preferences())).toEqual(
        { preferredModel: 'b' }
      )
    );
  });

  it('rolls back the cache when the mutation rejects', async () => {
    vi.mocked(aiModelsApi.updatePreferences).mockRejectedValue(
      new Error('network error')
    );
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(aiModelsQueryKeys.preferences(), {
      preferredModel: 'a',
    });

    const { result } = renderHook(() => useUpdateAISettings(), { wrapper });
    result.current.mutate({ preferredModel: 'b' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(aiModelsQueryKeys.preferences())).toEqual({
      preferredModel: 'a',
    });
  });
});
