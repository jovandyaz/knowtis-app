import { createHash, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSharingFixture,
  type SharingFixture,
} from '../../__tests__/sharing.fixture';
import {
  notePermissions,
  notes,
} from '../../../../database/schema/notes.schema';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { resolveEffectiveAccess } from '../../domain/access-policy';
import { DrizzleAccessSnapshotRepository } from './drizzle-access-snapshot.repository';

describe.runIf(DB_AVAILABLE)(
  'Authoritative access snapshots PostgreSQL',
  () => {
    let f: SharingFixture;
    let repo: DrizzleAccessSnapshotRepository;
    beforeAll(async () => {
      f = await createSharingFixture();
      repo = new DrizzleAccessSnapshotRepository(f.db);
    });
    afterAll(async () => {
      await f?.close();
    });
    it('returns only authorization fields and a domain-separated token digest', async () => {
      const snapshot = await repo.findAccessSnapshot(f.ids.note);
      expect(snapshot).toEqual({
        ownerId: f.ids.owner,
        generalAccess: 'anyone_with_link',
        generalAccessPermission: 'editor',
        shareTokenFingerprint: createHash('sha256')
          .update(`knowtis:share-link:v1\0s1-${f.ids.note}`)
          .digest('hex'),
        directPermissions: expect.arrayContaining([
          { userId: f.ids.editor, permission: 'editor' },
          { userId: f.ids.viewer, permission: 'viewer' },
        ]),
      });
      expect(snapshot?.directPermissions).toHaveLength(2);
      expect(JSON.stringify(snapshot)).not.toContain('@example.test');
      expect(JSON.stringify(snapshot)).not.toContain('Same Name');
    });
    it('does not mistake a historical owner row for a direct grant', async () => {
      await f.db.insert(notePermissions).values({
        noteId: f.ids.note,
        userId: f.ids.owner,
        permission: 'viewer',
      });
      expect(
        (await repo.findAccessSnapshot(f.ids.note))?.directPermissions.some(
          (p) => p.userId === f.ids.owner
        )
      ).toBe(false);
    });
    it('reads the committed state without a stale cache', async () => {
      const before = await repo.findAccessSnapshot(f.ids.note);
      if (!before) {
        throw new Error('Expected access snapshot');
      }
      await f.db.transaction(async (tx) => {
        await tx
          .update(notes)
          .set({ shareToken: 'rotated-local-token' })
          .where(eq(notes.id, f.ids.note));
        await tx.insert(notePermissions).values({
          noteId: f.ids.note,
          userId: f.ids.target,
          permission: 'viewer',
        });
      });
      const after = await repo.findAccessSnapshot(f.ids.note);
      expect(after?.shareTokenFingerprint).not.toBe(
        before?.shareTokenFingerprint
      );
      expect(
        resolveEffectiveAccess(after, {
          userId: f.ids.target,
          suppliedTokenFingerprint: before.shareTokenFingerprint,
        })
      ).toBe('viewer');
      expect(
        resolveEffectiveAccess(after, {
          userId: f.ids.stranger,
          suppliedTokenFingerprint: before.shareTokenFingerprint,
        })
      ).toBe('none');
    });
    it('returns null for absent or soft-deleted notes', async () => {
      expect(await repo.findAccessSnapshot(randomUUID())).toBeNull();
      await f.db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(eq(notes.id, f.ids.note));
      expect(await repo.findAccessSnapshot(f.ids.note)).toBeNull();
    });
  }
);
