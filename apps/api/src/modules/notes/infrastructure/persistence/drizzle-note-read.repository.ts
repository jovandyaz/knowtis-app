import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  cosineDistance,
  count,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  GENERAL_ACCESS,
  INBOX_FILTER,
  type BucketFilter,
  type NoteBucketCounts,
  type NoteListView,
} from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  noteEmbeddings,
  notePermissions,
  notes,
  users,
  type Database,
} from '../../../../database';
import { escapeLike } from '../../../../database/escape-like';
import type {
  AccessibleNotePage,
  AccessibleNotesCount,
  NoteEntity,
  NoteListFilters,
  NotePageRequest,
  NoteReadRepository,
  NoteSummary,
  NoteView,
  NoteViewWithOwner,
} from '../../domain';
import { mapToNoteEntity, mapToNoteView } from './note-entity.mapper';

const noteViewColumns = {
  id: notes.id,
  title: notes.title,
  content: notes.content,
  ownerId: notes.ownerId,
  generalAccess: notes.generalAccess,
  generalAccessPermission: notes.generalAccessPermission,
  shareToken: notes.shareToken,
  editorsCanShare: notes.editorsCanShare,
  bucket: notes.bucket,
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
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
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
      .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
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
    const conditions = [
      eq(notes.ownerId, ownerId.value),
      isNull(notes.deletedAt),
    ];

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
    page: NotePageRequest,
    filters?: NoteListFilters
  ): Promise<AccessibleNotePage> {
    const where = this.accessibleWhere(userId, filters);
    const [results, totals] = await Promise.all([
      this.db
        .select({
          note: noteViewColumns,
          permission: notePermissions.permission,
        })
        .from(notes)
        .leftJoin(notePermissions, this.permissionJoinCondition(userId))
        .where(where)
        // updatedAt alone is not a total order, so ties would repeat or skip rows across pages
        .orderBy(desc(notes.updatedAt), desc(notes.id))
        .limit(page.limit)
        .offset((page.page - 1) * page.limit),
      this.db
        .select({ value: count() })
        .from(notes)
        .leftJoin(notePermissions, this.permissionJoinCondition(userId))
        .where(where),
    ]);

    return {
      items: results.map((row) => {
        const mapped: { note: NoteView; permission?: string } = {
          note: mapToNoteView(row.note),
        };
        if (row.permission) {
          mapped.permission = row.permission;
        }
        return mapped;
      }),
      total: totals[0]?.value ?? 0,
    };
  }

  async findAccessibleSummariesByUser(
    userId: UserId,
    search?: string
  ): Promise<NoteSummary[]> {
    return this.db
      .select(noteSummaryColumns)
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(this.accessibleWhere(userId, search ? { search } : undefined))
      .orderBy(desc(notes.updatedAt));
  }

  async findAccessibleNotesByLexicalRank(
    userId: UserId,
    query: string,
    limit: number
  ): Promise<NoteSummary[]> {
    if (!/[\p{L}\p{N}]/u.test(query)) {
      return this.db
        .select(noteSummaryColumns)
        .from(notes)
        .leftJoin(notePermissions, this.permissionJoinCondition(userId))
        .where(this.accessibleWhere(userId, { search: query }))
        .orderBy(desc(notes.updatedAt))
        .limit(limit);
    }

    const tsquery = sql`websearch_to_tsquery('simple', ${query})`;
    const document = sql`to_tsvector('simple', ${notes.title} || ' ' || ${notes.content})`;
    return this.db
      .select(noteSummaryColumns)
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(and(this.accessCondition(userId), sql`${document} @@ ${tsquery}`))
      .orderBy(desc(sql`ts_rank_cd(${document}, ${tsquery})`))
      .limit(limit);
  }

  async findAccessibleNotesByEmbedding(
    userId: UserId,
    queryVector: number[],
    model: string,
    limit: number
  ): Promise<NoteSummary[]> {
    const distance = cosineDistance(noteEmbeddings.embedding, queryVector);
    return this.db
      .select(noteSummaryColumns)
      .from(notes)
      .innerJoin(noteEmbeddings, eq(noteEmbeddings.noteId, notes.id))
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(and(this.accessCondition(userId), eq(noteEmbeddings.model, model)))
      .orderBy(distance)
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

  async countAccessibleByBucket(userId: UserId): Promise<NoteBucketCounts> {
    const rows = await this.db
      .select({ bucket: notes.bucket, value: count() })
      .from(notes)
      .leftJoin(notePermissions, this.permissionJoinCondition(userId))
      .where(this.accessCondition(userId))
      .groupBy(notes.bucket);

    const counts: NoteBucketCounts = {
      inbox: 0,
      projects: 0,
      areas: 0,
      resources: 0,
      archive: 0,
    };
    for (const row of rows) {
      counts[row.bucket ?? INBOX_FILTER] = Number(row.value);
    }
    return counts;
  }

  async findByShareToken(token: string): Promise<NoteViewWithOwner | null> {
    const result = await this.db
      .select({ note: noteViewColumns, owner: ownerColumns })
      .from(notes)
      .innerJoin(users, eq(notes.ownerId, users.id))
      .where(
        and(
          eq(notes.shareToken, token),
          eq(notes.generalAccess, GENERAL_ACCESS.ANYONE_WITH_LINK),
          isNull(notes.deletedAt)
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

  /** Access predicate that also excludes soft-deleted rows (global read invariant). */
  private accessCondition(userId: UserId): SQL | undefined {
    return and(
      isNull(notes.deletedAt),
      or(
        eq(notes.ownerId, userId.value),
        eq(notePermissions.userId, userId.value)
      )
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

  private bucketCondition(bucket?: BucketFilter): SQL | undefined {
    if (!bucket) {
      return undefined;
    }
    return bucket === INBOX_FILTER
      ? isNull(notes.bucket)
      : eq(notes.bucket, bucket);
  }

  private viewCondition(userId: UserId, view?: NoteListView): SQL | undefined {
    if (!view || view === 'all') {
      return undefined;
    }
    return view === 'mine'
      ? eq(notes.ownerId, userId.value)
      : ne(notes.ownerId, userId.value);
  }

  private accessibleWhere(
    userId: UserId,
    filters?: NoteListFilters
  ): SQL | undefined {
    const conditions = [
      this.accessCondition(userId),
      this.searchCondition(filters?.search),
      this.bucketCondition(filters?.bucket),
      this.viewCondition(userId, filters?.view),
    ].filter((condition): condition is SQL => condition !== undefined);
    return and(...conditions);
  }
}
