import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { aiModelsApi } from '@knowtis/api-client';
import type {
  AIPreferences,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { aiModelsQueryKeys } from './useAvailableModels';

export function useAISettings(enabled = true) {
  return useQuery({
    queryKey: aiModelsQueryKeys.preferences(),
    queryFn: () => aiModelsApi.getPreferences(),
    staleTime: 1000 * 60,
    enabled,
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAiPreferencesInput) =>
      aiModelsApi.updatePreferences(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: aiModelsQueryKeys.preferences(),
      });
      const previous = queryClient.getQueryData<AIPreferences>(
        aiModelsQueryKeys.preferences()
      );
      if (previous) {
        queryClient.setQueryData(aiModelsQueryKeys.preferences(), {
          ...previous,
          ...input,
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          aiModelsQueryKeys.preferences(),
          context.previous
        );
      }
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: aiModelsQueryKeys.preferences(),
      });
      // The primary provider picks which key serves each intent, so the
      // catalog's intents move with it.
      if (input.primaryProvider !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: aiModelsQueryKeys.list(),
        });
      }
    },
  });
}
