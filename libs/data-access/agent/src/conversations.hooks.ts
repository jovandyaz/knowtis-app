import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import { ApiClientError, conversationsApi } from '@knowtis/api-client';

const FIRST_PAGE = 1;
const CONVERSATIONS_STALE_TIME_MS = 30_000;
const NOT_FOUND_STATUS = 404;

export const conversationsQueryKeys = {
  all: ['conversations'] as const,
  list: (limit: number) =>
    [...conversationsQueryKeys.all, 'list', limit] as const,
} as const;

export interface RenameConversationInput {
  id: string;
  title: string;
}

/** Outcome callbacks that still run when the component that mutated has unmounted. */
export type ConversationMutationCallbacks<TVariables> = Pick<
  UseMutationOptions<void, Error, TVariables>,
  'onSuccess' | 'onError'
>;

export function invalidateConversations(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: conversationsQueryKeys.all });
}

export function isConversationGone(error: unknown): boolean {
  return (
    ApiClientError.isApiClientError(error) && error.status === NOT_FOUND_STATUS
  );
}

export function useConversations(limit: number) {
  return useQuery({
    queryKey: conversationsQueryKeys.list(limit),
    queryFn: () => conversationsApi.list({ page: FIRST_PAGE, limit }),
    staleTime: CONVERSATIONS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}

export function useRenameConversation(
  callbacks: ConversationMutationCallbacks<RenameConversationInput> = {}
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: RenameConversationInput) =>
      conversationsApi.rename(id, title),
    ...callbacks,
    onSettled: () => invalidateConversations(queryClient),
  });
}

export function useDeleteConversation(
  callbacks: ConversationMutationCallbacks<string> = {}
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationsApi.remove(id),
    ...callbacks,
    onSettled: () => invalidateConversations(queryClient),
  });
}
