import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  PERMISSION,
  type PermissionLevel as PermissionLevelType,
} from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  notePermissions,
  notes,
  users,
  type Database,
  type NewNote,
  type NewNotePermission,
} from '../../../../database';
import type { UserId } from '../../../auth/domain';
import {
  NoteErrors,
  PermissionLevel,
  type CreateNoteData,
  type CreatePermissionData,
  type NoteDomainError,
  type NoteEntity,
  type NotePermissionEntity,
  type NoteReadRepository,
  type NoteRepository,
  type NoteWriteRepository,
  type PermissionRepository,
  type UpdateNoteData,
} from '../../domain';

@Injectable()
export class DrizzleNoteRepository
  implements
    NoteRepository,
    NoteReadRepository,
    NoteWriteRepository,
    PermissionRepository
{
  private readonly logger = new Logger(DrizzleNoteRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async findById(id: string): Promise<NoteEntity | null> {
    const result = await this.db
      .select()
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);

    if (!result[0]) {
      return null;
    }
    return this.mapToEntity(result[0]);
  }

  async findByIdWithOwner(id: string): Promise<NoteEntity | null> {
    const result = await this.db
      .select({
        note: notes,
        owner: {
          id: users.id,
          name: users.name,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(notes)
      .innerJoin(users, eq(notes.ownerId, users.id))
      .where(eq(notes.id, id))
      .limit(1);

    if (!result[0]) {
      return null;
    }
    return this.mapToEntity(result[0].note);
  }

  async findByOwner(ownerId: UserId, search?: string): Promise<NoteEntity[]> {
    const conditions = [eq(notes.ownerId, ownerId.value)];

    if (search) {
      const searchCondition = or(
        ilike(notes.title, `%${search}%`),
        ilike(notes.content, `%${search}%`)
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const results = await this.db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.updatedAt));

    return results.map(this.mapToEntity);
  }

  async findAccessibleByUser(
    userId: UserId,
    search?: string
  ): Promise<{ note: NoteEntity; permission?: string }[]> {
    const accessCondition = or(
      eq(notes.ownerId, userId.value),
      eq(notePermissions.userId, userId.value),
      eq(notes.isPublic, true)
    );

    const searchCondition = search
      ? or(
          ilike(notes.title, `%${search}%`),
          ilike(notes.content, `%${search}%`)
        )
      : undefined;

    const whereCondition = searchCondition
      ? and(accessCondition, searchCondition)
      : accessCondition;

    const results = await this.db
      .select({
        note: notes,
        permission: notePermissions.permission,
      })
      .from(notes)
      .leftJoin(
        notePermissions,
        and(
          eq(notePermissions.noteId, notes.id),
          eq(notePermissions.userId, userId.value)
        )
      )
      .where(whereCondition)
      .orderBy(desc(notes.updatedAt));

    return results.map((row) => {
      const mapped: { note: NoteEntity; permission?: string } = {
        note: this.mapToEntity(row.note),
      };
      if (row.permission) {
        mapped.permission = row.permission;
      }
      return mapped;
    });
  }

  async create(
    data: CreateNoteData
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const newNote: NewNote = {
        title: data.title,
        content: data.content,
        ownerId: data.ownerId.value,
      };

      const result = await this.db.insert(notes).values(newNote).returning();
      if (!result[0]) {
        return err(NoteErrors.noteNotFound('Failed to create'));
      }

      return ok(this.mapToEntity(result[0]));
    } catch (e) {
      return err(
        NoteErrors.invalidContent(
          e instanceof Error ? e.message : 'Unknown error'
        )
      );
    }
  }

  async update(
    id: string,
    data: UpdateNoteData
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const updateData: Partial<NewNote> = { updatedAt: new Date() };

      if (data.title !== undefined) {
        updateData.title = data.title;
      }
      if (data.content !== undefined) {
        updateData.content = data.content;
      }
      if (data.isPublic !== undefined) {
        updateData.isPublic = data.isPublic;
      }

      const result = await this.db
        .update(notes)
        .set(updateData)
        .where(eq(notes.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(this.mapToEntity(result[0]));
    } catch (e) {
      return err(
        NoteErrors.invalidContent(
          e instanceof Error ? e.message : 'Unknown error'
        )
      );
    }
  }

  async updateYjsState(
    id: string,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const result = await this.db
        .update(notes)
        .set({ yjsState, updatedAt: new Date() })
        .where(eq(notes.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(this.mapToEntity(result[0]));
    } catch (error) {
      this.logger.error(
        `Failed to update Yjs state for note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('updateYjsState', id));
    }
  }

  async delete(id: string): Promise<Result<boolean, NoteDomainError>> {
    try {
      const result = await this.db
        .delete(notes)
        .where(eq(notes.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(true);
    } catch (error) {
      this.logger.error(
        `Failed to delete note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('delete', id));
    }
  }

  async findPermission(
    noteId: string,
    userId: UserId
  ): Promise<NotePermissionEntity | null> {
    const result = await this.db
      .select()
      .from(notePermissions)
      .where(
        and(
          eq(notePermissions.noteId, noteId),
          eq(notePermissions.userId, userId.value)
        )
      )
      .limit(1);

    if (!result[0]) {
      return null;
    }

    const permissionResult = PermissionLevel.create(result[0].permission);
    if (permissionResult.isErr()) {
      return null;
    }

    return {
      noteId: result[0].noteId,
      userId: result[0].userId,
      permission: permissionResult.value,
    };
  }

  async findPermissionsByNote(noteId: string): Promise<
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
    const results = await this.db
      .select({
        permission: notePermissions,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(notePermissions)
      .innerJoin(users, eq(notePermissions.userId, users.id))
      .where(eq(notePermissions.noteId, noteId));

    const mapped: {
      permission: NotePermissionEntity;
      user: {
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
      };
    }[] = [];

    for (const row of results) {
      const permissionResult = PermissionLevel.create(
        row.permission.permission
      );
      if (permissionResult.isOk()) {
        mapped.push({
          permission: {
            noteId: row.permission.noteId,
            userId: row.permission.userId,
            permission: permissionResult.value,
          },
          user: row.user,
        });
      }
    }

    return mapped;
  }

  async createPermission(
    data: CreatePermissionData
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    try {
      const levelResult = PermissionLevel.create(data.permission);
      if (levelResult.isErr()) {
        return err(levelResult.error);
      }

      const newPerm: NewNotePermission = {
        noteId: data.noteId,
        userId: data.userId.value,
        permission: data.permission as PermissionLevelType,
      };

      const result = await this.db
        .insert(notePermissions)
        .values(newPerm)
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(data.noteId));
      }

      return ok({
        noteId: result[0].noteId,
        userId: result[0].userId,
        permission: levelResult.value,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create permission for note ${data.noteId}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('createPermission', data.noteId));
    }
  }

  async updatePermission(
    noteId: string,
    userId: UserId,
    permission: string
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    try {
      const levelResult = PermissionLevel.create(permission);
      if (levelResult.isErr()) {
        return err(levelResult.error);
      }

      const result = await this.db
        .update(notePermissions)
        .set({ permission: permission as PermissionLevelType })
        .where(
          and(
            eq(notePermissions.noteId, noteId),
            eq(notePermissions.userId, userId.value)
          )
        )
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(noteId));
      }

      return ok({
        noteId: result[0].noteId,
        userId: result[0].userId,
        permission: levelResult.value,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update permission for note ${noteId}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('updatePermission', noteId));
    }
  }

  async deletePermission(
    noteId: string,
    userId: UserId
  ): Promise<Result<boolean, NoteDomainError>> {
    try {
      const result = await this.db
        .delete(notePermissions)
        .where(
          and(
            eq(notePermissions.noteId, noteId),
            eq(notePermissions.userId, userId.value)
          )
        )
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(noteId));
      }
      return ok(true);
    } catch (error) {
      this.logger.error(
        `Failed to delete permission for note ${noteId}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('deletePermission', noteId));
    }
  }

  async hasAccess(
    noteId: string,
    userId: UserId,
    requiredPermission?: PermissionLevelType
  ): Promise<boolean> {
    const note = await this.findById(noteId);
    if (!note) {
      return false;
    }

    if (note.ownerId === userId.value) {
      return true;
    }

    if (note.isPublic && !requiredPermission) {
      return true;
    }

    const permission = await this.findPermission(noteId, userId);
    if (!permission) {
      return false;
    }

    if (requiredPermission === PERMISSION.EDITOR) {
      return permission.permission.isEditor();
    }

    return true;
  }

  private mapToEntity(record: typeof notes.$inferSelect): NoteEntity {
    return {
      id: record.id,
      title: record.title,
      content: record.content,
      ownerId: record.ownerId,
      isPublic: record.isPublic ?? false,
      yjsState: record.yjsState as Buffer | null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
