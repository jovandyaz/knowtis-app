import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import type { Result } from 'neverthrow';

import type { PermissionLevel as PermissionLevelType } from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import type {
  CreateNoteData,
  CreatePermissionData,
  NoteDomainError,
  NoteEntity,
  NoteEntityWithOwner,
  NotePermissionEntity,
  NoteRepository,
  UpdateNoteContentData,
  UpdateNoteData,
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

  findByIdWithOwner(id: string): Promise<NoteEntityWithOwner | null> {
    return this.readRepo.findByIdWithOwner(id);
  }

  findByOwner(ownerId: UserId, search?: string): Promise<NoteEntity[]> {
    return this.readRepo.findByOwner(ownerId, search);
  }

  findAccessibleByUser(
    userId: UserId,
    search?: string
  ): Promise<{ note: NoteEntity; permission?: string }[]> {
    return this.readRepo.findAccessibleByUser(userId, search);
  }

  findByShareToken(token: string): Promise<NoteEntityWithOwner | null> {
    return this.readRepo.findByShareToken(token);
  }

  create(data: CreateNoteData): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.writeRepo.create(data);
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

  createPermission(
    data: CreatePermissionData
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    return this.permissionRepo.createPermission(data);
  }

  updatePermission(
    noteId: string,
    userId: UserId,
    permission: string
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    return this.permissionRepo.updatePermission(noteId, userId, permission);
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
