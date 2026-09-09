import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type { NoteEntity } from '../../domain/entities/note.entity';
import type { NoteReadRepository } from '../../domain/ports/note-read.repository';
import type { NoteWriteRepository } from '../../domain/ports/note-write.repository';
import { RotateShareLinkHandler } from './rotate-share-link.handler';

const note: NoteEntity = {
  id: 'note',
  ownerId: 'owner',
  title: 'Note',
  content: '<p>Keep</p>',
  shareToken: 'old',
  generalAccess: 'restricted',
  generalAccessPermission: 'editor',
  editorsCanShare: true,
  bucket: null,
  supertag: null,
  supertagFields: null,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
function setup(loaded: NoteEntity | null = note) {
  const repo = {
    findById: vi.fn().mockResolvedValue(loaded),
    rotateShareToken: vi
      .fn()
      .mockImplementation(async (input) =>
        ok({ ...note, shareToken: input.newToken })
      ),
  };
  const emitter = new EventEmitter2();
  return {
    repo,
    emitter,
    handler: new RotateShareLinkHandler(
      repo as unknown as NoteReadRepository,
      repo as unknown as NoteWriteRepository,
      emitter
    ),
  };
}
describe('RotateShareLinkHandler', () => {
  it.each(['editor', 'viewer', 'admin', 'stranger'])(
    'denies %s without writing or signaling',
    async (actorId) => {
      const { repo, emitter, handler } = setup();
      const events: unknown[] = [];
      emitter.on('note.access-changed', (event) => events.push(event));
      expect(
        (await handler.execute({ noteId: note.id, actorId }))._unsafeUnwrapErr()
          .code
      ).toBe('PERMISSION_DENIED');
      expect(repo.rotateShareToken).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    }
  );
  it('fails with NOTE_NOT_FOUND when the note is absent or deleted', async () => {
    const { handler, repo } = setup(null);
    expect(
      (
        await handler.execute({ noteId: note.id, actorId: 'owner' })
      )._unsafeUnwrapErr().code
    ).toBe('NOTE_NOT_FOUND');
    expect(repo.rotateShareToken).not.toHaveBeenCalled();
  });
  it('fails with SHARE_LINK_CONFLICT when the note has no active link', async () => {
    const { handler, repo } = setup({ ...note, shareToken: null });
    expect(
      (
        await handler.execute({ noteId: note.id, actorId: 'owner' })
      )._unsafeUnwrapErr().code
    ).toBe('SHARE_LINK_CONFLICT');
    expect(repo.rotateShareToken).not.toHaveBeenCalled();
  });
  it('uses an unpredictable 16-byte token and signals only after committed success', async () => {
    const { handler, repo, emitter } = setup();
    const events: unknown[] = [];
    emitter.on('note.access-changed', (event) => events.push(event));
    const commit =
      Promise.withResolvers<
        Result<NoteEntity, { code: string; message: string }>
      >();
    repo.rotateShareToken.mockReturnValue(commit.promise);
    const request = handler.execute({ noteId: note.id, actorId: 'owner' });
    await vi.waitFor(() =>
      expect(repo.rotateShareToken).toHaveBeenCalledOnce()
    );
    expect(events).toEqual([]);
    const input = repo.rotateShareToken.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      noteId: 'note',
      ownerId: 'owner',
      expectedToken: 'old',
    });
    expect(input.newToken).toMatch(/^[a-f0-9]{32}$/);
    commit.resolve(ok({ ...note, shareToken: input.newToken }));
    expect((await request)._unsafeUnwrap().shareToken).toBe(input.newToken);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ noteId: note.id });
    expect(events[0]).not.toHaveProperty('shareToken');
  });
  it('does not signal CAS failure and preserves success if invalidation delivery fails', async () => {
    const { handler, repo, emitter } = setup();
    const events: unknown[] = [];
    emitter.on('note.access-changed', (event) => {
      events.push(event);
      throw new Error('Redis unavailable');
    });
    repo.rotateShareToken.mockResolvedValueOnce(
      err({ code: 'SHARE_LINK_CONFLICT', message: 'Conflict' })
    );
    expect(
      (await handler.execute({ noteId: note.id, actorId: 'owner' })).isErr()
    ).toBe(true);
    expect(events).toEqual([]);
    expect(
      (await handler.execute({ noteId: note.id, actorId: 'owner' })).isOk()
    ).toBe(true);
    expect(events).toHaveLength(1);
  });
});
