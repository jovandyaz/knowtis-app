import type { NotesListFilters } from '@knowtis/shared-types';

export const notesQueryKeys = {
  all: ['notes'] as const,
  lists: () => [...notesQueryKeys.all, 'list'] as const,
  list: (filters: NotesListFilters = {}) =>
    [
      ...notesQueryKeys.lists(),
      {
        search: filters.search,
        bucket: filters.bucket,
        view: filters.view,
        tag: filters.tag,
      },
    ] as const,
  recents: () => [...notesQueryKeys.all, 'recent'] as const,
  recent: (limit: number) => [...notesQueryKeys.recents(), limit] as const,
  counts: () => [...notesQueryKeys.all, 'counts'] as const,
  details: () => [...notesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...notesQueryKeys.details(), id] as const,
  sharedNote: (token: string) =>
    [...notesQueryKeys.all, 'shared', token] as const,
} as const;

export const tagsQueryKeys = {
  all: ['tags'] as const,
  tree: () => [...tagsQueryKeys.all, 'tree'] as const,
} as const;
