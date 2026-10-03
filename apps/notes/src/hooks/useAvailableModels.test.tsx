import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { aiModelsApi } from '@knowtis/api-client';
import type {
  ModelCatalogResponse,
  SelectableModel,
} from '@knowtis/shared-types';

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
  it('yields the tier envelope the server answered', async () => {
    const catalog: ModelCatalogResponse = {
      tier: 'byok',
      models: [{ id: 'anthropic:claude-sonnet-5' } as SelectableModel],
      intents: [],
    };
    vi.mocked(aiModelsApi.getModels).mockResolvedValue(catalog);

    const { result } = renderHook(() => useAvailableModels(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(catalog);
  });
});
