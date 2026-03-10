import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  mcpKeysApi,
  type CreateMcpKeyInput,
  type McpApiKey,
} from '@knowtis/api-client';

export const mcpKeysQueryKeys = {
  all: ['mcp-keys'] as const,
  list: () => [...mcpKeysQueryKeys.all, 'list'] as const,
} as const;

export function useMcpKeys() {
  return useQuery({
    queryKey: mcpKeysQueryKeys.list(),
    queryFn: () => mcpKeysApi.getAll(),
    staleTime: 1000 * 60,
  });
}

export function useCreateMcpKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMcpKeyInput) => mcpKeysApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeysQueryKeys.list() });
    },
  });
}

export function useRevokeMcpKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => mcpKeysApi.revoke(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: mcpKeysQueryKeys.list() });

      const previousKeys = queryClient.getQueryData<McpApiKey[]>(
        mcpKeysQueryKeys.list()
      );

      if (previousKeys) {
        queryClient.setQueryData<McpApiKey[]>(
          mcpKeysQueryKeys.list(),
          previousKeys.filter((key) => key.id !== id)
        );
      }

      return { previousKeys };
    },
    onError: (_err, _id, context) => {
      if (context?.previousKeys) {
        queryClient.setQueryData(mcpKeysQueryKeys.list(), context.previousKeys);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeysQueryKeys.list() });
    },
  });
}
