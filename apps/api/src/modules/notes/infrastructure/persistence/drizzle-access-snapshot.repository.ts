import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  type Database,
} from '../../../../database/database.module';
import {
  notePermissions,
  notes,
} from '../../../../database/schema/notes.schema';
import type { AccessSnapshot } from '../../domain/access-policy';
import type { AccessSnapshotRepository } from '../../domain/ports/access-snapshot.repository';
import { shareTokenFingerprint } from '../../domain/share-token-fingerprint';

@Injectable()
export class DrizzleAccessSnapshotRepository implements AccessSnapshotRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}
  async findAccessSnapshot(noteId: string): Promise<AccessSnapshot | null> {
    const rows = await this.db
      .select({
        ownerId: notes.ownerId,
        generalAccess: notes.generalAccess,
        generalAccessPermission: notes.generalAccessPermission,
        shareToken: notes.shareToken,
        direct: {
          userId: notePermissions.userId,
          permission: notePermissions.permission,
        },
      })
      .from(notes)
      .leftJoin(
        notePermissions,
        and(
          eq(notePermissions.noteId, notes.id),
          ne(notePermissions.userId, notes.ownerId)
        )
      )
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    const first = rows[0];
    if (!first) {
      return null;
    }
    return {
      ownerId: first.ownerId,
      generalAccess: first.generalAccess,
      generalAccessPermission: first.generalAccessPermission,
      shareTokenFingerprint: shareTokenFingerprint(first.shareToken),
      directPermissions: rows.flatMap((row) =>
        row.direct ? [row.direct] : []
      ),
    };
  }
}
