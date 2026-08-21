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
  supertag?: Supertag;
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

export const SUPERTAGS = [
  'person',
  'book',
  'project',
  'meeting',
  'idea',
] as const;
export type Supertag = (typeof SUPERTAGS)[number];

export const SUPERTAG_FIELD_KIND = {
  text: 'text',
  date: 'date',
  url: 'url',
  number: 'number',
} as const;

const KIND = SUPERTAG_FIELD_KIND;

export const SUPERTAG_FIELD_KINDS = [
  KIND.text,
  KIND.date,
  KIND.url,
  KIND.number,
] as const;
export type SupertagFieldKind = (typeof SUPERTAG_FIELD_KINDS)[number];

export interface SupertagField {
  readonly key: string;
  readonly kind: SupertagFieldKind;
  readonly required: boolean;
  readonly maxLength?: number;
}

const SHORT_TEXT = 120;
const LONG_TEXT = 200;
const URL_LENGTH = 500;
const ROSTER_LENGTH = 500;
const STATUS_LENGTH = 60;

/**
 * The single source every consumer derives from: the API builds a validator,
 * the frontend a form plus its Zod schema, MCP a tool input schema. Descriptors
 * rather than Zod so this package keeps its zero runtime dependencies.
 */
export const SUPERTAG_CATALOG = {
  person: [
    { key: 'name', kind: KIND.text, required: true, maxLength: SHORT_TEXT },
    { key: 'role', kind: KIND.text, required: false, maxLength: SHORT_TEXT },
    { key: 'contact', kind: KIND.text, required: false, maxLength: LONG_TEXT },
  ],
  book: [
    { key: 'title', kind: KIND.text, required: true, maxLength: LONG_TEXT },
    { key: 'author', kind: KIND.text, required: false, maxLength: SHORT_TEXT },
    { key: 'url', kind: KIND.url, required: false, maxLength: URL_LENGTH },
    { key: 'rating', kind: KIND.number, required: false },
  ],
  project: [
    { key: 'name', kind: KIND.text, required: true, maxLength: SHORT_TEXT },
    {
      key: 'status',
      kind: KIND.text,
      required: false,
      maxLength: STATUS_LENGTH,
    },
    { key: 'due', kind: KIND.date, required: false },
  ],
  meeting: [
    { key: 'subject', kind: KIND.text, required: true, maxLength: LONG_TEXT },
    { key: 'date', kind: KIND.date, required: false },
    {
      key: 'attendees',
      kind: KIND.text,
      required: false,
      maxLength: ROSTER_LENGTH,
    },
  ],
  idea: [
    { key: 'summary', kind: KIND.text, required: true, maxLength: LONG_TEXT },
    { key: 'source', kind: KIND.url, required: false, maxLength: URL_LENGTH },
  ],
} as const satisfies Record<Supertag, readonly SupertagField[]>;

/** Values are null, never undefined — undefined does not survive a JSON round trip into jsonb. */
export type SupertagFields = Record<string, string | number | null>;

export type NoteSupertagCounts = Record<Supertag, number>;

/** Server default and the page size the notes list requests; both sides must agree or pages overlap. */
export const DEFAULT_NOTES_PAGE_SIZE = 25;

export interface NotesPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Bulk "Organize Inbox" pass size; more than this and the user repeats the pass. */
export const MAX_BULK_SUGGEST_NOTES = 20;
export const MAX_SUGGESTED_TAGS = 5;
export const MAX_RELATED_NOTES = 3;

export interface SuggestedTag {
  path: string;
  /** Server truth: the model is never asked whether a tag already exists. */
  isNew: boolean;
}

export interface RelatedNote {
  id: string;
  title: string;
}

export interface OrganizationSuggestion {
  /** Echoed from the request — never model-produced, so a hallucinated id cannot exist. */
  noteId: string;
  bucket: ParaBucket | null;
  tags: SuggestedTag[];
  relatedNotes: RelatedNote[];
}
