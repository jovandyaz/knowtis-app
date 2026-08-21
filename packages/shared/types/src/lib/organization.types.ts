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
  tag?: string;
}

export const TAG_PATH_SEPARATOR = '/';
export const TAG_MAX_DEPTH = 4;
export const TAG_SEGMENT_MAX_LENGTH = 32;
export const TAG_PATH_MAX_LENGTH = 120;
export const TAG_SEGMENT_PATTERN = /^[a-z0-9-]+$/;
export const TAG_COLOR_MAX_LENGTH = 32;
export const TAG_MAX_PER_NOTE = 20;

/** A tag's depth-1 root, which is the only level that carries a colour. */
export function tagRootOf(path: string): string {
  return path.split(TAG_PATH_SEPARATOR)[0] ?? path;
}

export interface TagNode {
  id: string;
  path: string;
  color: string | null;
  noteCount: number;
}

/** Server default and the page size the notes list requests; both sides must agree or pages overlap. */
export const DEFAULT_NOTES_PAGE_SIZE = 25;

export interface NotesPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
