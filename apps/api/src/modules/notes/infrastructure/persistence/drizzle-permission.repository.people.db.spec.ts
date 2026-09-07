import { randomUUID } from 'node:crypto';

import { UserId } from '@jovandyaz/auth/server';
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
import { DrizzlePermissionRepository } from './drizzle-permission.repository';

describe.runIf(DB_AVAILABLE)(
  'People projection and safe narrowing PostgreSQL',
  () => {
    let f: SharingFixture;
    let repo: DrizzlePermissionRepository;
    beforeAll(async () => {
      f = await createSharingFixture();
      repo = new DrizzlePermissionRepository(f.db);
    });
    afterAll(async () => {
      await f?.close();
    });
    it('projects the owner without a grant row, first, then name/email/ID order', async () => {
      const people = await repo.findPeopleByNote(f.ids.note);
      expect(people.map((p) => [p.user.id, p.permission])).toEqual([
        [f.ids.owner, 'owner'],
        [f.ids.editor, 'editor'],
        [f.ids.viewer, 'viewer'],
      ]);
      expect(
        people.every((p) => Object.keys(p).sort().join() === 'permission,user')
      ).toBe(true);
      expect(people[0].user.avatarUrl).toBeNull();
    });
    it('does not duplicate a historical owner permission row', async () => {
      await f.db.insert(notePermissions).values({
        noteId: f.ids.note,
        userId: f.ids.owner,
        permission: 'viewer',
      });
      const people = await repo.findPeopleByNote(f.ids.note);
      expect(people.filter((p) => p.user.id === f.ids.owner)).toHaveLength(1);
      expect(people[0].permission).toBe('owner');
    });
    it('returns no People for absent or soft-deleted notes', async () => {
      expect(await repo.findPeopleByNote(randomUUID())).toEqual([]);
      await f.db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(eq(notes.id, f.ids.note));
      try {
        expect(await repo.findPeopleByNote(f.ids.note)).toEqual([]);
      } finally {
        await f.db
          .update(notes)
          .set({ deletedAt: null })
          .where(eq(notes.id, f.ids.note));
      }
    });
    it('cannot recreate a grant removed after a narrowing was authorized', async () => {
      const userId = UserId.fromTrusted(f.ids.target);
      await repo.upsertPermission({
        noteId: f.ids.note,
        userId,
        permission: 'editor',
      });
      await repo.deletePermission(f.ids.note, userId);
      const narrowed = await repo.upsertPermission({
        noteId: f.ids.note,
        userId,
        permission: 'viewer',
        allowAmplification: false,
      });
      expect(narrowed._unsafeUnwrapErr().code).toBe('EMAIL_NOT_VERIFIED');
      expect(await repo.findPermission(f.ids.note, userId)).toBeNull();
    });
    it('cannot restore editing after a concurrent downgrade without verification', async () => {
      const userId = UserId.fromTrusted(f.ids.target);
      await repo.upsertPermission({
        noteId: f.ids.note,
        userId,
        permission: 'viewer',
      });
      const result = await repo.upsertPermission({
        noteId: f.ids.note,
        userId,
        permission: 'editor',
        allowAmplification: false,
      });
      expect(result._unsafeUnwrapErr().code).toBe('EMAIL_NOT_VERIFIED');
      expect(
        (await repo.findPermission(f.ids.note, userId))?.permission.value
      ).toBe('viewer');
    });
    it('upserts concurrent verified grants with exactly one final permission row', async () => {
      const userId = UserId.fromTrusted(f.ids.target);
      const results = await Promise.all(
        ['viewer', 'editor', 'viewer', 'editor'].map((permission) =>
          repo.upsertPermission({ noteId: f.ids.note, userId, permission })
        )
      );
      expect(results.every((result) => result.isOk())).toBe(true);
      const people = await repo.findPeopleByNote(f.ids.note);
      expect(people.filter((p) => p.user.id === f.ids.target)).toHaveLength(1);
    });
  }
);
