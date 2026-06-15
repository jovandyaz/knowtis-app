import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

import { GENERAL_ACCESS } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  notePermissions,
  notes,
  users,
  type Database,
} from '../../../../database';
import type {
  AccessibleNotesCount,
  NoteEntity,
  NoteReadRepository,
  NoteSummary,
  NoteView,
  NoteViewWithOwner,
} from '../../domain';
import { mapToNoteEntity, mapToNoteView } from './note-entity.mapper';

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

const noteViewColumns = {
  id: notes.id,
  title: notes.title,
  content: notes.content,
  ownerId: notes.ownerId,
  generalAccess: notes.generalAccess,
  generalAccessPermission: notes.generalAccessPermission,
  shareToken: notes.shareToken,
  editorsCanShare: notes.editorsCanShare,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

const noteSummaryColumns = {
  id: notes.id,
  title: notes.title,
  ownerId: notes.ownerId,
  generalAccess: notes.generalAccess,
  shareToken: notes.shareToken,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

const ownerColumns = {
  id: users.id,
  name: users.name,
  avatarUrl: users.avatarUrl,
};

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

  async findByIdWithOwner(id: string): Promise<NoteViewWithOwner | null> {
    const result = await this.db
      .select({ note: noteViewColumns, owner: ownerColumns })
      .from(notes)
      .innerJoin(users, eq(notes.ownerId, users.id))
      .where(eq(notes.id, id))
      .limit(1);

    if (!result[0]) {
      return null;
    }
    return { ...mapToNoteView(result[0].note), owner: result[0].owner };
  }

  async findByIdForUser(
    noteId: string,
    userId: UserId
  ): Promise<NoteView | null> {
    const result = await this.db
      .select(noteViewColumns)
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(and(eq(notes.id, noteId), this.accessCondition(userId)))
      .limit(1);

    if (!result[0]) {
      return null;
    }
    return mapToNoteView(result[0]);
  }

  async findByOwner(ownerId: UserId, search?: string): Promise<NoteEntity[]> {
    const conditions = [eq(notes.ownerId, ownerId.value)];

    const searchCondition = this.searchCondition(search);
    if (searchCondition) {
      conditions.push(searchCondition);
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
  ): Promise<{ note: NoteView; permission?: string }[]> {
    const results = await this.db
      .select({
        note: noteViewColumns,
        permission: notePermissions.permission,
      })
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(this.accessibleWhere(userId, search))
      .orderBy(desc(notes.updatedAt));

    return results.map((row) => {
      const mapped: { note: NoteView; permission?: string } = {
        note: mapToNoteView(row.note),
      };
      if (row.permission) {
        mapped.permission = row.permission;
      }
      return mapped;
    });
  }

  async findAccessibleSummariesByUser(
    userId: UserId,
    search?: string
  ): Promise<NoteSummary[]> {
    return this.db
      .select(noteSummaryColumns)
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(this.accessibleWhere(userId, search))
      .orderBy(desc(notes.updatedAt));
  }

  async findAccessibleNotesByLexicalRank(
    userId: UserId,
    query: string,
    limit: number
  ): Promise<NoteSummary[]> {
    const tsquery = sql`websearch_to_tsquery('simple', ${query})`;
    const document = sql`to_tsvector('simple', ${notes.title} || ' ' || ${notes.content})`;

    const ftsRows = await this.db
      .select(noteSummaryColumns)
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(and(this.accessCondition(userId), sql`${document} @@ ${tsquery}`))
      .orderBy(desc(sql`ts_rank_cd(${document}, ${tsquery})`))
      .limit(limit);

    if (ftsRows.length > 0) {
      return ftsRows;
    }
    return this.db
      .select(noteSummaryColumns)
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(this.accessibleWhere(userId, query))
      .orderBy(desc(notes.updatedAt))
      .limit(limit);
  }

  async countAccessibleByUser(userId: UserId): Promise<AccessibleNotesCount> {
    const result = await this.db
      .select({
        total: count(),
        owned: count(
          sql`CASE WHEN ${notes.ownerId} = ${userId.value} THEN 1 END`
        ),
      })
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(this.accessCondition(userId));

    return result[0] ?? { total: 0, owned: 0 };
  }

  async findByShareToken(token: string): Promise<NoteViewWithOwner | null> {
    const result = await this.db
      .select({ note: noteViewColumns, owner: ownerColumns })
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
    return { ...mapToNoteView(result[0].note), owner: result[0].owner };
  }

  private permissionJoinCondition(userId: UserId): SQL | undefined {
    return and(
      eq(notePermissions.noteId, notes.id),
      eq(notePermissions.userId, userId.value)
    );
  }

  private accessCondition(userId: UserId): SQL | undefined {
    return or(
      eq(notes.ownerId, userId.value),
      eq(notePermissions.userId, userId.value)
    );
  }

  private searchCondition(search?: string): SQL | undefined {
    if (!search) {
      return undefined;
    }
    return or(
      ilike(notes.title, `%${escapeLike(search)}%`),
      ilike(notes.content, `%${escapeLike(search)}%`)
    );
  }

  private accessibleWhere(userId: UserId, search?: string): SQL | undefined {
    const access = this.accessCondition(userId);
    const searchCondition = this.searchCondition(search);
    return searchCondition ? and(access, searchCondition) : access;
  }
}
