import type { UserId } from '@jovandyaz/auth/server';

import type {
  NoteEntity,
  NoteSummary,
  NoteView,
  NoteViewWithOwner,
} from '../entities';

export interface AccessibleNotesCount {
  readonly total: number;
  readonly owned: number;
}

export interface NoteReadRepository {
  findById(id: string): Promise<NoteEntity | null>;
  findByIdWithOwner(id: string): Promise<NoteViewWithOwner | null>;
  findByIdForUser(noteId: string, userId: UserId): Promise<NoteView | null>;
  findByOwner(ownerId: UserId, search?: string): Promise<NoteEntity[]>;
  findAccessibleByUser(
    userId: UserId,
    search?: string
  ): Promise<{ note: NoteView; permission?: string }[]>;
  findAccessibleSummariesByUser(
    userId: UserId,
    search?: string
  ): Promise<NoteSummary[]>;
  findAccessibleNotesByLexicalRank(
    userId: UserId,
    query: string,
    limit: number
  ): Promise<NoteSummary[]>;
  findAccessibleNotesByEmbedding(
    userId: UserId,
    queryVector: number[],
    model: string,
    limit: number
  ): Promise<NoteSummary[]>;
  countAccessibleByUser(userId: UserId): Promise<AccessibleNotesCount>;
  findByShareToken(token: string): Promise<NoteViewWithOwner | null>;
}

export const NOTE_READ_REPOSITORY = Symbol('NOTE_READ_REPOSITORY');
