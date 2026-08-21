import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { tagsApi, type UpdateTagInput } from '@knowtis/api-client';
import type { TagNode } from '@knowtis/shared-types';

import { notesQueryKeys, tagsQueryKeys } from './query-keys';

const TREE_STALE_TIME_MS = 1000 * 30;

export function useTags() {
  return useQuery({
    queryKey: tagsQueryKeys.tree(),
    queryFn: () => tagsApi.getAll(),
    staleTime: TREE_STALE_TIME_MS,
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTagInput }) =>
      tagsApi.update(id, input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
      // A rename rewrites the paths the notes payload carries, so the lists are stale too.
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.all });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: tagsQueryKeys.tree() });
      const previous = queryClient.getQueryData<TagNode[]>(
        tagsQueryKeys.tree()
      );
      const branch = previous?.find((node) => node.id === id);

      if (branch) {
        queryClient.setQueryData<TagNode[]>(tagsQueryKeys.tree(), (old) =>
          old?.filter(
            (node) =>
              node.path !== branch.path &&
              !node.path.startsWith(`${branch.path}/`)
          )
        );
      }

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tagsQueryKeys.tree(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.all });
    },
  });
}
