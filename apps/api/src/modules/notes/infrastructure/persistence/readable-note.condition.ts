import { sql, type SQL } from 'drizzle-orm';

import { notePermissions, notes } from '../../../../database';

// Mirrors DrizzleNoteReadRepository.accessCondition as a self-contained
// predicate for queries that cannot left-join note_permissions;
// readable-note.condition.db.spec.ts pins the two together.
export function readableNoteCondition(userId: string): SQL {
  return sql`(${notes.deletedAt} IS NULL AND (${notes.ownerId} = ${userId} OR EXISTS (SELECT 1 FROM ${notePermissions} WHERE ${notePermissions.noteId} = ${notes.id} AND ${notePermissions.userId} = ${userId})))`;
}
