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

export interface NotesOverview {
  readonly total: number;
  readonly owned: number;
  readonly sharedWithMe: number;
}
