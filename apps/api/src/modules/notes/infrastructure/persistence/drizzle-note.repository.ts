import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import type { Result } from 'neverthrow';

import type {
  NoteBucketCounts,
  PermissionLevel as PermissionLevelType,
} from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import type {
  AccessibleNotesCount,
  CreateNoteData,
  NoteDomainError,
  NoteEntity,
  NoteListFilters,
  NotePermissionEntity,
  NoteRepository,
  NoteSummary,
  NoteView,
  NoteViewWithOwner,
  UpdateNoteContentData,
  UpdateNoteData,
  UpsertPermissionData,
} from '../../domain';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';
import { DrizzleNoteWriteRepository } from './drizzle-note-write.repository';
import { DrizzlePermissionRepository } from './drizzle-permission.repository';

@Injectable()
export class DrizzleNoteRepository implements NoteRepository {
  private readonly readRepo: DrizzleNoteReadRepository;
  private readonly writeRepo: DrizzleNoteWriteRepository;
  private readonly permissionRepo: DrizzlePermissionRepository;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: Database
  ) {
    this.readRepo = new DrizzleNoteReadRepository(db);
    this.writeRepo = new DrizzleNoteWriteRepository(db);
    this.permissionRepo = new DrizzlePermissionRepository(db);
  }

  findById(id: string): Promise<NoteEntity | null> {
    return this.readRepo.findById(id);
  }

  findByIdWithOwner(id: string): Promise<NoteViewWithOwner | null> {
    return this.readRepo.findByIdWithOwner(id);
  }

  findByIdForUser(noteId: string, userId: UserId): Promise<NoteView | null> {
    return this.readRepo.findByIdForUser(noteId, userId);
  }

  findByOwner(ownerId: UserId, search?: string): Promise<NoteEntity[]> {
    return this.readRepo.findByOwner(ownerId, search);
  }

  findAccessibleByUser(
    userId: UserId,
    filters?: NoteListFilters
  ): Promise<{ note: NoteView; permission?: string }[]> {
    return this.readRepo.findAccessibleByUser(userId, filters);
  }

  findAccessibleSummariesByUser(
    userId: UserId,
    search?: string
  ): Promise<NoteSummary[]> {
    return this.readRepo.findAccessibleSummariesByUser(userId, search);
  }

  findAccessibleNotesByLexicalRank(
    userId: UserId,
    query: string,
    limit: number
  ): Promise<NoteSummary[]> {
    return this.readRepo.findAccessibleNotesByLexicalRank(userId, query, limit);
  }

  findAccessibleNotesByEmbedding(
    userId: UserId,
    queryVector: number[],
    model: string,
    limit: number
  ): Promise<NoteSummary[]> {
    return this.readRepo.findAccessibleNotesByEmbedding(
      userId,
      queryVector,
      model,
      limit
    );
  }

  countAccessibleByUser(userId: UserId): Promise<AccessibleNotesCount> {
    return this.readRepo.countAccessibleByUser(userId);
  }

  countAccessibleByBucket(userId: UserId): Promise<NoteBucketCounts> {
    return this.readRepo.countAccessibleByBucket(userId);
  }

  findByShareToken(token: string): Promise<NoteViewWithOwner | null> {
    return this.readRepo.findByShareToken(token);
  }

  create(data: CreateNoteData): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.create(data);
  }

  createWithYjsState(
    data: CreateNoteData,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.createWithYjsState(data, yjsState);
  }

  update(
    id: string,
    data: UpdateNoteData
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.update(id, data);
  }

  updateYjsState(
    id: string,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.updateYjsState(id, yjsState);
  }

  updateContentWithYjsState(
    id: string,
    data: UpdateNoteContentData,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.updateContentWithYjsState(id, data, yjsState);
  }

  delete(id: string): Promise<Result<boolean, NoteDomainError>> {
    return this.writeRepo.delete(id);
  }

  restore(
    id: string,
    ownerId: string
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.restore(id, ownerId);
  }

  findPermission(
    noteId: string,
    userId: UserId
  ): Promise<NotePermissionEntity | null> {
    return this.permissionRepo.findPermission(noteId, userId);
  }

  findPermissionsByNote(noteId: string): Promise<
    {
      permission: NotePermissionEntity;
      user: {
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
      };
    }[]
  > {
    return this.permissionRepo.findPermissionsByNote(noteId);
  }

  upsertPermission(
    data: UpsertPermissionData
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    return this.permissionRepo.upsertPermission(data);
  }

  deletePermission(
    noteId: string,
    userId: UserId
  ): Promise<Result<boolean, NoteDomainError>> {
    return this.permissionRepo.deletePermission(noteId, userId);
  }

  hasAccess(
    noteId: string,
    userId: UserId,
    requiredPermission?: PermissionLevelType
  ): Promise<boolean> {
    return this.permissionRepo.hasAccess(noteId, userId, requiredPermission);
  }
}
