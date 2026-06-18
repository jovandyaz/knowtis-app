import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiModelsApi } from '@knowtis/api-client';

import { useAISettings } from './useAISettings';

vi.mock('@knowtis/api-client', () => ({
  aiModelsApi: { getPreferences: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAISettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the stored preference', async () => {
    vi.mocked(aiModelsApi.getPreferences).mockResolvedValue({
      preferredModel: 'openai:gpt-4o-mini',
    });
    const { result } = renderHook(() => useAISettings(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.preferredModel).toBe('openai:gpt-4o-mini');
  });
});
