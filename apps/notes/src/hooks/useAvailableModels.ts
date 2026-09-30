import { useQuery } from '@tanstack/react-query';

import { aiModelsApi, type ModelCatalogView } from '@knowtis/api-client';

export const aiModelsQueryKeys = {
  all: ['ai-models'] as const,
  list: () => [...aiModelsQueryKeys.all, 'list'] as const,
  preferences: () => [...aiModelsQueryKeys.all, 'preferences'] as const,
} as const;

export function useAvailableModels(enabled = true) {
  return useQuery({
    queryKey: aiModelsQueryKeys.list(),
    queryFn: () => aiModelsApi.getModels(),
    select: (catalog: ModelCatalogView) => catalog.models,
    staleTime: 1000 * 60 * 10,
    enabled,
  });
}
