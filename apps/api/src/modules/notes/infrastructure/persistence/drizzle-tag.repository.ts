import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, like, ne, notLike, or, sql } from 'drizzle-orm';

import { isTagColor, type TagColor, type TagNode } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  notePermissions,
  notes,
  noteTags,
  tags,
  type Database,
} from '../../../../database';
import { escapeLike } from '../../../../database/escape-like';
import type { TagRecord, TagRepository } from '../../domain';
import type { TagPath } from '../../domain/value-objects/tag-path.vo';

@Injectable()
export class DrizzleTagRepository implements TagRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async findTreeByOwner(userId: UserId): Promise<TagNode[]> {
    const descendants = sql`descendant.path = ${tags.path} OR descendant.path LIKE ${tags.path} || '/%'`;
    // COUNT(DISTINCT) because a note tagged both `work` and `work/alpha`
    // belongs to `work` once, not twice.
    const noteCount = sql<number>`(
      SELECT COUNT(DISTINCT link.note_id)
      FROM ${noteTags} link
      INNER JOIN ${tags} descendant ON descendant.id = link.tag_id
      INNER JOIN ${notes} note ON note.id = link.note_id
      WHERE descendant.owner_id = ${userId.value}
        AND (${descendants})
        AND note.deleted_at IS NULL
        AND (
          note.owner_id = ${userId.value}
          OR EXISTS (
            SELECT 1 FROM ${notePermissions} grant_
            WHERE grant_.note_id = note.id AND grant_.user_id = ${userId.value}
          )
        )
    )`.mapWith(Number);

    const rows = await this.db
      .select({
        id: tags.id,
        path: tags.path,
        color: tags.color,
        noteCount,
      })
      .from(tags)
      .where(eq(tags.ownerId, userId.value))
      .orderBy(tags.path);

    return rows.map((row) => ({ ...row, color: toTagColor(row.color) }));
  }

  async findById(tagId: string): Promise<TagRecord | null> {
    const [row] = await this.db
      .select({
        id: tags.id,
        ownerId: tags.ownerId,
        path: tags.path,
        color: tags.color,
      })
      .from(tags)
      .where(eq(tags.id, tagId))
      .limit(1);

    return row ? { ...row, color: toTagColor(row.color) } : null;
  }

  async ensurePaths(userId: UserId, paths: TagPath[]): Promise<string[]> {
    const wanted = [...new Set(paths.flatMap((path) => path.withAncestors()))];
    if (wanted.length === 0) {
      return [];
    }

    await this.db
      .insert(tags)
      .values(wanted.map((path) => ({ ownerId: userId.value, path })))
      .onConflictDoNothing({ target: [tags.ownerId, tags.path] });

    const rows = await this.db
      .select({ id: tags.id, path: tags.path })
      .from(tags)
      .where(and(eq(tags.ownerId, userId.value), inArray(tags.path, wanted)));

    const byPath = new Map(rows.map((row) => [row.path, row.id]));
    return paths
      .map((path) => byPath.get(path.value))
      .filter((id): id is string => id !== undefined);
  }

  async replaceNoteTags(noteId: string, tagIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(noteTags).where(eq(noteTags.noteId, noteId));
      if (tagIds.length > 0) {
        await tx
          .insert(noteTags)
          .values(tagIds.map((tagId) => ({ noteId, tagId })))
          .onConflictDoNothing();
      }
    });
  }

  async findPathsByNotes(noteIds: string[]): Promise<Map<string, string[]>> {
    if (noteIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({ noteId: noteTags.noteId, path: tags.path })
      .from(noteTags)
      .innerJoin(tags, eq(tags.id, noteTags.tagId))
      .where(inArray(noteTags.noteId, noteIds))
      .orderBy(tags.path);

    const byNote = new Map<string, string[]>();
    for (const row of rows) {
      const paths = byNote.get(row.noteId);
      if (paths) {
        paths.push(row.path);
      } else {
        byNote.set(row.noteId, [row.path]);
      }
    }
    return byNote;
  }

  async findPathCollision(
    tag: TagRecord,
    nextPath: TagPath
  ): Promise<string | null> {
    const withinTarget = or(
      eq(tags.path, nextPath.value),
      like(tags.path, `${escapeLike(nextPath.value)}/%`)
    );
    const outsideSource = and(
      ne(tags.id, tag.id),
      notLike(tags.path, `${escapeLike(tag.path)}/%`)
    );

    const [row] = await this.db
      .select({ path: tags.path })
      .from(tags)
      .where(and(eq(tags.ownerId, tag.ownerId), withinTarget, outsideSource))
      .orderBy(tags.path)
      .limit(1);

    return row?.path ?? null;
  }

  async renameBranch(tag: TagRecord, nextPath: TagPath): Promise<void> {
    const descendantSuffixStart = tag.path.length + 1;

    await this.db.transaction(async (tx) => {
      await tx
        .update(tags)
        .set({ path: nextPath.value, updatedAt: new Date() })
        .where(eq(tags.id, tag.id));

      await tx
        .update(tags)
        .set({
          // The ::int cast is load-bearing: bound as text, `substring(x from $n)`
          // resolves to the regex overload and silently yields NULL.
          path: sql`${nextPath.value} || substring(${tags.path} from ${descendantSuffixStart}::int)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tags.ownerId, tag.ownerId),
            like(tags.path, `${escapeLike(tag.path)}/%`)
          )
        );
    });
  }

  async recolor(tagId: string, color: TagColor | null): Promise<void> {
    await this.db
      .update(tags)
      .set({ color, updatedAt: new Date() })
      .where(eq(tags.id, tagId));
  }

  async deleteBranch(tag: TagRecord): Promise<void> {
    await this.db
      .delete(tags)
      .where(
        and(
          eq(tags.ownerId, tag.ownerId),
          or(eq(tags.id, tag.id), like(tags.path, `${escapeLike(tag.path)}/%`))
        )
      );
  }
}

function toTagColor(value: string | null): TagColor | null {
  return isTagColor(value) ? value : null;
}
