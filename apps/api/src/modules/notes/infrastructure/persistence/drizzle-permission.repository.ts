import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  GENERAL_ACCESS,
  PERMISSION,
  type NotePerson,
  type PermissionLevel as PermissionLevelType,
} from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  notePermissions,
  notes,
  type Database,
  type NewNotePermission,
} from '../../../../database';
import { users } from '../../../../database/schema/users.schema';
import {
  NoteErrors,
  PermissionLevel,
  type NoteDomainError,
  type NotePermissionEntity,
  type PermissionRepository,
  type UpsertPermissionData,
} from '../../domain';

@Injectable()
export class DrizzlePermissionRepository implements PermissionRepository {
  private readonly logger = new Logger(DrizzlePermissionRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

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

  async findPeopleByNote(noteId: string): Promise<NotePerson[]> {
    const personFields = {
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    };
    const owner = this.db
      .select({
        ...personFields,
        permission: sql<NotePerson['permission']>`'owner'::text`.as(
          'permission'
        ),
        rank: sql<number>`0`.as('rank'),
      })
      .from(notes)
      .innerJoin(users, eq(users.id, notes.ownerId))
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    const direct = this.db
      .select({
        ...personFields,
        permission: sql<
          NotePerson['permission']
        >`${notePermissions.permission}::text`.as('permission'),
        rank: sql<number>`1`.as('rank'),
      })
      .from(notes)
      .innerJoin(notePermissions, eq(notePermissions.noteId, notes.id))
      .innerJoin(users, eq(users.id, notePermissions.userId))
      .where(
        and(
          eq(notes.id, noteId),
          isNull(notes.deletedAt),
          ne(notePermissions.userId, notes.ownerId)
        )
      );
    const people = owner.unionAll(direct).as('people');
    const rows = await this.db
      .select({
        id: people.id,
        name: people.name,
        email: people.email,
        avatarUrl: people.avatarUrl,
        permission: people.permission,
      })
      .from(people)
      .orderBy(
        people.rank,
        sql`${people.name} COLLATE "C"`,
        sql`${people.email} COLLATE "C"`,
        people.id
      );
    return rows.map(({ permission, ...user }) => ({ user, permission }));
  }

  async upsertPermission(
    data: UpsertPermissionData
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

      // A concurrent revoke must not turn an unverified narrowing into a new grant.
      const result =
        data.allowAmplification === false
          ? await this.db
              .update(notePermissions)
              .set({ permission: newPerm.permission })
              .where(
                and(
                  eq(notePermissions.noteId, data.noteId),
                  eq(notePermissions.userId, data.userId.value),
                  newPerm.permission === PERMISSION.EDITOR
                    ? eq(notePermissions.permission, PERMISSION.EDITOR)
                    : undefined
                )
              )
              .returning()
          : await this.db
              .insert(notePermissions)
              .values(newPerm)
              .onConflictDoUpdate({
                target: [notePermissions.noteId, notePermissions.userId],
                set: { permission: newPerm.permission },
              })
              .returning();

      if (!result[0]) {
        return err(
          data.allowAmplification === false
            ? NoteErrors.verificationRequired()
            : NoteErrors.persistenceError('upsertPermission', data.noteId)
        );
      }

      return ok({
        noteId: result[0].noteId,
        userId: result[0].userId,
        permission: levelResult.value,
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert permission for note ${data.noteId}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('upsertPermission', data.noteId));
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
    const note = await this.db
      .select({ ownerId: notes.ownerId, generalAccess: notes.generalAccess })
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .limit(1);

    if (!note[0]) {
      return false;
    }

    if (note[0].ownerId === userId.value) {
      return true;
    }

    if (
      note[0].generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK &&
      !requiredPermission
    ) {
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
}
