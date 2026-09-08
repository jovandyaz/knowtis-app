import { useMutation, useQueryClient } from '@tanstack/react-query';

import { notesApi, type NoteDetail } from '@knowtis/api-client';

import { notesQueryKeys } from './query-keys';

export function useRotateShareLink(noteId: string) {
  const queryClient = useQueryClient();
  const detailKey = notesQueryKeys.detail(noteId);

  const removeSharedCopies = async (
    previousToken: string | null | undefined
  ) => {
    const filters = {
      queryKey: [...notesQueryKeys.all, 'shared'],
      predicate: (query: {
        queryKey: readonly unknown[];
        state: { data: unknown };
      }) => {
        const { data } = query.state;
        return (
          (previousToken != null && query.queryKey[2] === previousToken) ||
          (typeof data === 'object' &&
            data !== null &&
            'id' in data &&
            typeof data.id === 'string' &&
            data.id === noteId)
        );
      },
    };
    await queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  };

  return useMutation({
    mutationFn: () => notesApi.rotateShareLink(noteId),
    retry: 0,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      return {
        previousToken:
          queryClient.getQueryData<NoteDetail>(detailKey)?.shareToken,
      };
    },
    onSuccess: async (updated, _variables, context) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      await removeSharedCopies(context?.previousToken);
      queryClient.setQueryData<NoteDetail>(detailKey, (previous) =>
        previous ? { ...previous, ...updated } : undefined
      );
    },
    onError: async (_error, _variables, context) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      await removeSharedCopies(context?.previousToken);
      await queryClient
        .fetchQuery({
          queryKey: detailKey,
          queryFn: () => notesApi.getById(noteId),
          retry: false,
          staleTime: 0,
        })
        .catch(() => undefined);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: notesQueryKeys.sharingAuthority(noteId),
        }),
        queryClient.invalidateQueries({
          queryKey: notesQueryKeys.people(noteId),
        }),
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() }),
        queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() }),
      ]);
    },
  });
}
