import type {
  MutationFilters,
  MutationStatus,
  QueryClient,
} from '@tanstack/react-query';

import { notesQueryKeys } from './query-keys';

export const createNoteMutationKey = [...notesQueryKeys.all, 'create'] as const;

const HELD_ONCE_SETTLED: Partial<Record<MutationStatus, boolean>> = {
  success: true,
  error: false,
};

function createsNote(
  noteId: string
): NonNullable<MutationFilters['predicate']> {
  return (mutation) => {
    const { variables } = mutation.state;
    return (
      typeof variables === 'object' &&
      variables !== null &&
      'id' in variables &&
      variables.id === noteId
    );
  };
}

/**
 * Settles with whether the server holds a note this client is creating: true
 * once its create succeeds, false once it is refused. A note no create of this
 * client names, such as one opened from the server, counts as held.
 */
export function whenNoteCreated(
  queryClient: QueryClient,
  noteId: string
): Promise<boolean> {
  const mutationCache = queryClient.getMutationCache();
  const create = mutationCache
    .findAll({
      mutationKey: createNoteMutationKey,
      predicate: createsNote(noteId),
    })
    .at(-1);
  if (!create) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const settled = HELD_ONCE_SETTLED[create.state.status];
    if (settled !== undefined) {
      resolve(settled);
      return;
    }
    const unsubscribe = mutationCache.subscribe(({ mutation }) => {
      const held =
        mutation === create
          ? HELD_ONCE_SETTLED[create.state.status]
          : undefined;
      if (held !== undefined) {
        unsubscribe();
        resolve(held);
      }
    });
  });
}
