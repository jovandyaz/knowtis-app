import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { aiModelsApi } from '@knowtis/api-client';
import type { SelectableModel } from '@knowtis/shared-types';

import { useAvailableModels } from './useAvailableModels';

vi.mock('@knowtis/api-client', () => ({
  aiModelsApi: { getModels: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAvailableModels', () => {
  it('yields the catalog models whatever shape the server answered', async () => {
    const model = { id: 'anthropic:claude-sonnet-5' } as SelectableModel;
    vi.mocked(aiModelsApi.getModels).mockResolvedValue({
      tier: 'byok',
      models: [model],
      intents: [],
    });

    const { result } = renderHook(() => useAvailableModels(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([model]);
  });
});
