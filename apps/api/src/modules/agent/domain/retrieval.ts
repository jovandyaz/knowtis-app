export interface NoteMeta {
  readonly updatedAt: string;
  readonly isOwner: boolean;
  readonly isSharedWithMe: boolean;
  readonly isPubliclyShared: boolean;
}

export interface NoteHit extends NoteMeta {
  readonly id: string;
  readonly title: string;
}

export interface AgentNote extends NoteMeta {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
}

/** `unindexed` is present only on a total miss: accessible notes whose current
 * text the semantic leg cannot reach yet. */
export interface SearchNotesResult {
  readonly hits: readonly NoteHit[];
  readonly unindexed?: readonly NoteHit[];
}

export interface NotesOverview {
  readonly total: number;
  readonly owned: number;
  readonly sharedWithMe: number;
}
