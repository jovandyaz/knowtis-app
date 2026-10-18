import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { memoriesApi } from '@knowtis/api-client';
import type { UserMemoryItem } from '@knowtis/shared-types';

import { isGone } from './api-errors';

const MEMORIES_STALE_TIME_MS = 30_000;
const ONLY_WRITE_IN_FLIGHT = 1;

export const memoriesQueryKeys = {
  all: ['memories'] as const,
  list: () => [...memoriesQueryKeys.all, 'list'] as const,
} as const;

const MEMORY_WRITE_KEY = [...memoriesQueryKeys.all, 'write'] as const;

export interface EditMemoryInput {
  id: string;
  content: string;
}

/** Outcome callbacks that still run when the component that mutated has unmounted. */
export interface MemoryMutationCallbacks<TData = void> {
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

interface ForgottenMemory {
  memory: UserMemoryItem;
  index: number;
}

function invalidateAfterLastWrite(queryClient: QueryClient): void {
  if (
    queryClient.isMutating({ mutationKey: MEMORY_WRITE_KEY }) ===
    ONLY_WRITE_IN_FLIGHT
  ) {
    void queryClient.invalidateQueries({ queryKey: memoriesQueryKeys.all });
  }
}

function putBack(queryClient: QueryClient, forgotten: ForgottenMemory): void {
  queryClient.setQueryData<UserMemoryItem[]>(
    memoriesQueryKeys.list(),
    (memories) =>
      !memories || memories.some(({ id }) => id === forgotten.memory.id)
        ? memories
        : [
            ...memories.slice(0, forgotten.index),
            forgotten.memory,
            ...memories.slice(forgotten.index),
          ]
  );
}

async function forgetMemory(id: string): Promise<void> {
  try {
    await memoriesApi.remove(id);
  } catch (error) {
    if (!isGone(error)) {
      throw error;
    }
  }
}

/** The caller's memories, newest-updated first, as the API orders them. */
export function useMemories() {
  return useQuery({
    queryKey: memoriesQueryKeys.list(),
    queryFn: () => memoriesApi.list(),
    staleTime: MEMORIES_STALE_TIME_MS,
  });
}

/** Forgets one memory optimistically, putting it back where it was on failure; one already gone counts as forgotten. */
export function useForgetMemory(callbacks: MemoryMutationCallbacks = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MEMORY_WRITE_KEY,
    mutationFn: forgetMemory,
    onMutate: async (id: string): Promise<ForgottenMemory | undefined> => {
      await queryClient.cancelQueries({ queryKey: memoriesQueryKeys.list() });
      const memories = queryClient.getQueryData<UserMemoryItem[]>(
        memoriesQueryKeys.list()
      );
      const index = memories?.findIndex((memory) => memory.id === id) ?? -1;
      if (!memories || index === -1) {
        return undefined;
      }
      queryClient.setQueryData(
        memoriesQueryKeys.list(),
        memories.filter((memory) => memory.id !== id)
      );
      return { memory: memories[index], index };
    },
    onSuccess: () => callbacks.onSuccess?.(),
    onError: (error, _id, forgotten) => {
      if (forgotten) {
        putBack(queryClient, forgotten);
      }
      callbacks.onError?.(error);
    },
    onSettled: () => invalidateAfterLastWrite(queryClient),
  });
}

/** Forgets every memory; `onSuccess` receives how many the API deleted. */
export function useForgetAllMemories(
  callbacks: MemoryMutationCallbacks<number> = {}
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MEMORY_WRITE_KEY,
    mutationFn: async () => (await memoriesApi.removeAll()).deleted,
    onSuccess: (deleted) => {
      queryClient.setQueryData<UserMemoryItem[]>(memoriesQueryKeys.list(), []);
      callbacks.onSuccess?.(deleted);
    },
    onError: (error) => callbacks.onError?.(error),
    onSettled: () => invalidateAfterLastWrite(queryClient),
  });
}

export function useEditMemory(callbacks: MemoryMutationCallbacks = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MEMORY_WRITE_KEY,
    mutationFn: ({ id, content }: EditMemoryInput) =>
      memoriesApi.edit(id, content),
    onSuccess: (_data, { id, content }) => {
      const updatedAt = new Date().toISOString();
      queryClient.setQueryData<UserMemoryItem[]>(
        memoriesQueryKeys.list(),
        (memories) =>
          memories?.map((memory) =>
            memory.id === id ? { ...memory, content, updatedAt } : memory
          )
      );
      callbacks.onSuccess?.();
    },
    onError: (error) => callbacks.onError?.(error),
    onSettled: () => invalidateAfterLastWrite(queryClient),
  });
}
