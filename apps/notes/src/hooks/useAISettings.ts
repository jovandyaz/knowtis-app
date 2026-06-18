import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { aiModelsApi } from '@knowtis/api-client';
import type { AIPreferences } from '@knowtis/shared-types';

import { aiModelsQueryKeys } from './useAvailableModels';

export function useAISettings() {
  return useQuery({
    queryKey: aiModelsQueryKeys.preferences(),
    queryFn: () => aiModelsApi.getPreferences(),
    staleTime: 1000 * 60,
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AIPreferences) => aiModelsApi.updatePreferences(input),
    onSuccess: (data) => {
      queryClient.setQueryData(aiModelsQueryKeys.preferences(), data);
    },
  });
}
