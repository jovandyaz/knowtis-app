export const PARA_BUCKETS = [
  'projects',
  'areas',
  'resources',
  'archive',
] as const;
export type ParaBucket = (typeof PARA_BUCKETS)[number];

export const INBOX_FILTER = 'inbox' as const;

export const BUCKET_FILTERS = [...PARA_BUCKETS, INBOX_FILTER] as const;
export type BucketFilter = (typeof BUCKET_FILTERS)[number];

export const NOTE_LIST_VIEWS = ['all', 'mine', 'shared'] as const;
export type NoteListView = (typeof NOTE_LIST_VIEWS)[number];

export type NoteBucketCounts = Record<BucketFilter, number>;

export interface NotesListFilters {
  search?: string;
  bucket?: BucketFilter;
  view?: NoteListView;
}
