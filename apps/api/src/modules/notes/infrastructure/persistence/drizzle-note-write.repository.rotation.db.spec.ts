import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSharingFixture,
  type SharingFixture,
} from '../../__tests__/sharing.fixture';
import { notes } from '../../../../database/schema/notes.schema';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { GetSharedNoteArtifactsHandler } from '../../../artifacts/application/queries/get-shared-note-artifacts.handler';
import { DrizzleArtifactRepository } from '../../../artifacts/infrastructure/persistence/drizzle-artifact.repository';
import { RotateShareLinkHandler } from '../../application/commands/rotate-share-link.handler';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';
import { DrizzleNoteWriteRepository } from './drizzle-note-write.repository';

describe.runIf(DB_AVAILABLE)('Share link rotation PostgreSQL contract', () => {
  let f: SharingFixture;
  let repo: DrizzleNoteWriteRepository;
  beforeEach(async () => {
    f = await createSharingFixture();
    repo = new DrizzleNoteWriteRepository(f.db);
  });
  afterEach(async () => {
    await f?.close();
  });
  const row = async () => {
    const [record] = await f.db
      .select()
      .from(notes)
      .where(eq(notes.id, f.ids.note));
    if (!record) {
      throw new Error('Expected the fixture note to exist');
    }
    return record;
  };
  const rotate = (
    expectedToken: string,
    newToken: string,
    ownerId = f.ids.owner
  ) =>
    repo.rotateShareToken({
      noteId: f.ids.note,
      ownerId,
      expectedToken,
      newToken,
    });

  it('keeps the first winning token when a delayed initial metadata writer arrives', async () => {
    await f.db
      .update(notes)
      .set({ shareToken: null })
      .where(eq(notes.id, f.ids.note));
    const stale = await new DrizzleNoteReadRepository(f.db).findById(
      f.ids.note
    );
    expect(stale?.shareToken).toBeNull();
    expect(
      (await repo.update(f.ids.note, { shareToken: 'first-winner' })).isOk()
    ).toBe(true);
    expect(
      (
        await repo.update(f.ids.note, {
          title: 'Delayed title',
          shareToken: 'stale-first-token',
        })
      ).isOk()
    ).toBe(true);
    expect(await row()).toMatchObject({
      title: 'Delayed title',
      shareToken: 'first-winner',
      content: '<p>Existing note content</p>',
    });
  });

  it('has one winner when two real connections rotate the same expected token', async () => {
    const before = await row();
    const results = await Promise.all([
      rotate(before.shareToken ?? '', 'winner-a'),
      rotate(before.shareToken ?? '', 'winner-b'),
    ]);
    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    expect(
      results
        .filter((result) => result.isErr())
        .map((result) => result._unsafeUnwrapErr().code)
    ).toEqual(['SHARE_LINK_CONFLICT']);
    const winner = results.find((result) => result.isOk())?._unsafeUnwrap();
    expect(await row()).toMatchObject({
      shareToken: winner?.shareToken,
      content: before.content,
      yjsState: before.yjsState,
      generalAccess: before.generalAccess,
      generalAccessPermission: before.generalAccessPermission,
      editorsCanShare: before.editorsCanShare,
    });
  });

  it('preserves the rotated token across delayed first-mint metadata and content/Yjs writes', async () => {
    await f.db
      .update(notes)
      .set({ shareToken: null })
      .where(eq(notes.id, f.ids.note));
    const stale = await new DrizzleNoteReadRepository(f.db).findById(
      f.ids.note
    );
    expect(stale?.shareToken).toBeNull();
    await repo.update(f.ids.note, { shareToken: 'minted-c' });
    expect((await rotate('minted-c', 'rotated-b')).isOk()).toBe(true);
    await repo.update(f.ids.note, {
      title: 'Delayed metadata',
      shareToken: 'stale-a',
    });
    await repo.updateContentWithYjsState(
      f.ids.note,
      { content: '<p>Latest content</p>', shareToken: 'stale-a' },
      Buffer.from([1, 2, 3])
    );
    await repo.updateYjsState(f.ids.note, Buffer.from([4, 5, 6]));
    expect(await row()).toMatchObject({
      shareToken: 'rotated-b',
      title: 'Delayed metadata',
      content: '<p>Latest content</p>',
      yjsState: Buffer.from([4, 5, 6]),
    });
  });

  it('makes the committed winning token visible on another connection before emitting invalidation', async () => {
    const events = new EventEmitter2();
    const observations: Promise<unknown>[] = [];
    events.on('note.access-changed', (event) => {
      expect(event.noteId).toBe(f.ids.note);
      expect(Object.keys(event).sort()).toEqual(['noteId', 'occurredOn']);
      observations.push(
        f.client`select share_token from notes where id = ${event.noteId}`
      );
    });
    const handler = new RotateShareLinkHandler(
      new DrizzleNoteReadRepository(f.db),
      repo,
      events
    );
    const result = await handler.execute({
      noteId: f.ids.note,
      actorId: f.ids.owner,
    });
    const changed = result._unsafeUnwrap();
    expect(observations).toHaveLength(1);
    expect(await observations[0]).toEqual([
      { share_token: changed.shareToken },
    ]);
  });
  it('logs only safe context when real PostgreSQL rejects a duplicate token', async () => {
    const other = await createSharingFixture();
    const canary = `private-rotation-token-${other.ids.note}`;
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await other.db
        .update(notes)
        .set({ shareToken: canary })
        .where(eq(notes.id, other.ids.note));
      const before = await row();
      const result = await rotate(before.shareToken ?? '', canary);
      expect(result._unsafeUnwrapErr().code).toBe('INTERNAL_ERROR');
      expect(log.mock.calls).toEqual([
        [
          {
            operation: 'rotateShareToken',
            noteId: f.ids.note,
            failureCategory: 'unique_violation',
          },
        ],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(canary);
      expect((await row()).shareToken).toBe(before.shareToken);
    } finally {
      log.mockRestore();
      await other.close();
    }
  });
  it('rejects a mismatched owner, missing token, stale token, and soft-deleted note', async () => {
    const before = await row();
    expect(
      (
        await rotate(before.shareToken ?? '', 'new', f.ids.editor)
      )._unsafeUnwrapErr().code
    ).toBe('SHARE_LINK_CONFLICT');
    expect((await rotate('stale', 'new'))._unsafeUnwrapErr().code).toBe(
      'SHARE_LINK_CONFLICT'
    );
    await f.db
      .update(notes)
      .set({ shareToken: null })
      .where(eq(notes.id, f.ids.note));
    expect(
      (await rotate(before.shareToken ?? '', 'new'))._unsafeUnwrapErr().code
    ).toBe('SHARE_LINK_CONFLICT');
    await f.db
      .update(notes)
      .set({ shareToken: before.shareToken, deletedAt: new Date() })
      .where(eq(notes.id, f.ids.note));
    expect(
      (await rotate(before.shareToken ?? '', 'new'))._unsafeUnwrapErr().code
    ).toBe('SHARE_LINK_CONFLICT');
    expect((await row()).shareToken).toBe(before.shareToken);
  });

  it('invalidates old token note and read-only artifact lookup while new token works; paused remains inaccessible', async () => {
    const reader = new DrizzleNoteReadRepository(f.db);
    const artifacts = new GetSharedNoteArtifactsHandler(
      reader,
      new DrizzleArtifactRepository(f.db)
    );
    const before = await row();
    expect((await artifacts.execute(before.shareToken ?? '')).isOk()).toBe(
      true
    );
    expect((await rotate(before.shareToken ?? '', 'new-token')).isOk()).toBe(
      true
    );
    expect(await reader.findByShareToken(before.shareToken ?? '')).toBeNull();
    expect((await artifacts.execute(before.shareToken ?? '')).isErr()).toBe(
      true
    );
    expect((await reader.findByShareToken('new-token'))?.id).toBe(f.ids.note);
    expect((await artifacts.execute('new-token'))._unsafeUnwrap()).toEqual([]);
    await repo.update(f.ids.note, { generalAccess: 'restricted' });
    expect((await rotate('new-token', 'paused-token')).isOk()).toBe(true);
    expect(await reader.findByShareToken('paused-token')).toBeNull();
    expect((await artifacts.execute('paused-token')).isErr()).toBe(true);
  });
});
