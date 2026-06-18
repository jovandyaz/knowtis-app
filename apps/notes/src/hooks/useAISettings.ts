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
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: aiModelsQueryKeys.preferences(),
      });
      const previous = queryClient.getQueryData<AIPreferences>(
        aiModelsQueryKeys.preferences()
      );
      queryClient.setQueryData(aiModelsQueryKeys.preferences(), input);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          aiModelsQueryKeys.preferences(),
          context.previous
        );
      } else {
        queryClient.removeQueries({
          queryKey: aiModelsQueryKeys.preferences(),
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: aiModelsQueryKeys.preferences(),
      });
    },
  });
}
