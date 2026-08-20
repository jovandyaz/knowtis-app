import type { UserId } from '@jovandyaz/auth/server';

import type {
  BucketFilter,
  NoteBucketCounts,
  NoteListView,
} from '@knowtis/shared-types';

import type {
  NoteEntity,
  NoteSummary,
  NoteView,
  NoteViewWithOwner,
} from '../entities';

export interface NoteListFilters {
  readonly search?: string;
  readonly bucket?: BucketFilter;
  readonly view?: NoteListView;
}

export interface NotePageRequest {
  readonly page: number;
  readonly limit: number;
}

export interface AccessibleNotePage {
  readonly items: { note: NoteView; permission?: string }[];
  readonly total: number;
}

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
    page: NotePageRequest,
    filters?: NoteListFilters
  ): Promise<AccessibleNotePage>;
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
  countAccessibleByBucket(userId: UserId): Promise<NoteBucketCounts>;
  findByShareToken(token: string): Promise<NoteViewWithOwner | null>;
}

export const NOTE_READ_REPOSITORY = Symbol('NOTE_READ_REPOSITORY');
