import { useQuery } from '@tanstack/react-query';

import { aiModelsApi } from '@knowtis/api-client';

export const aiModelsQueryKeys = {
  all: ['ai-models'] as const,
  list: () => [...aiModelsQueryKeys.all, 'list'] as const,
  preferences: () => [...aiModelsQueryKeys.all, 'preferences'] as const,
} as const;

export function useAvailableModels() {
  return useQuery({
    queryKey: aiModelsQueryKeys.list(),
    queryFn: () => aiModelsApi.getModels(),
    staleTime: 1000 * 60 * 10,
  });
}
