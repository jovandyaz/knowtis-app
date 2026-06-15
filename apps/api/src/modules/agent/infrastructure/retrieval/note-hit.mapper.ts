import type { NoteHit } from '../../domain/retrieval';

export interface NoteSummaryRow {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly generalAccess: string;
  readonly shareToken: string | null;
  readonly updatedAt: Date;
}

export function toNoteHit(note: NoteSummaryRow, userId: string): NoteHit {
  return {
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt.toISOString(),
    isOwner: note.ownerId === userId,
    isSharedWithMe: note.ownerId !== userId,
    isPubliclyShared:
      note.generalAccess !== 'restricted' || note.shareToken !== null,
  };
}
