import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { aiKeysApi } from '@knowtis/api-client';
import type { ByokProvider } from '@knowtis/shared-types';

import { aiModelsQueryKeys } from './useAvailableModels';

export const providerKeysQueryKeys = {
  all: ['ai-provider-keys'] as const,
  list: () => [...providerKeysQueryKeys.all, 'list'] as const,
} as const;

export function useProviderKeys(enabled: boolean) {
  return useQuery({
    queryKey: providerKeysQueryKeys.list(),
    queryFn: () => aiKeysApi.list(),
    enabled,
    staleTime: 1000 * 60,
  });
}

export function useSetProviderKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      apiKey,
    }: {
      provider: ByokProvider;
      apiKey: string;
    }) => aiKeysApi.set(provider, apiKey),
    onSuccess: (keys) => {
      qc.setQueryData(providerKeysQueryKeys.list(), keys);
      // Which models a caller may run is derived from the keys they hold.
      void qc.invalidateQueries({ queryKey: aiModelsQueryKeys.list() });
    },
  });
}

export function useDeleteProviderKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ByokProvider) => aiKeysApi.remove(provider),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: providerKeysQueryKeys.list() });
      void qc.invalidateQueries({ queryKey: aiModelsQueryKeys.list() });
    },
  });
}
