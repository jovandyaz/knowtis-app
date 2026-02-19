import type { UserId } from '@jovandyaz/auth';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, or } from 'drizzle-orm';

import { GENERAL_ACCESS } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  notePermissions,
  notes,
  users,
  type Database,
} from '../../../../database';
import type {
  NoteEntity,
  NoteEntityWithOwner,
  NoteReadRepository,
} from '../../domain';
import { mapToNoteEntity } from './note-entity.mapper';

@Injectable()
export class DrizzleNoteReadRepository implements NoteReadRepository {
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
    return mapToNoteEntity(result[0]);
  }

  async findByIdWithOwner(id: string): Promise<NoteEntityWithOwner | null> {
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
    return { ...mapToNoteEntity(result[0].note), owner: result[0].owner };
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

    return results.map(mapToNoteEntity);
  }

  async findAccessibleByUser(
    userId: UserId,
    search?: string
  ): Promise<{ note: NoteEntity; permission?: string }[]> {
    const accessCondition = or(
      eq(notes.ownerId, userId.value),
      eq(notePermissions.userId, userId.value)
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
        note: mapToNoteEntity(row.note),
      };
      if (row.permission) {
        mapped.permission = row.permission;
      }
      return mapped;
    });
  }

  async findByShareToken(token: string): Promise<NoteEntityWithOwner | null> {
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
      .where(
        and(
          eq(notes.shareToken, token),
          eq(notes.generalAccess, GENERAL_ACCESS.ANYONE_WITH_LINK)
        )
      )
      .limit(1);

    if (!result[0]) {
      return null;
    }
    return { ...mapToNoteEntity(result[0].note), owner: result[0].owner };
  }
}
