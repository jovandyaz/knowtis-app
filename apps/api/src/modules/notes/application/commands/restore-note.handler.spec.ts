import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { NoteErrors } from '../../domain/errors/note.errors';
import type { AnonymousNoteLimitPolicy } from '../anonymous-note-limit.policy';
import { RestoreNoteHandler } from './restore-note.handler';

function noteLimitOf(
  admitted: ReturnType<typeof NoteErrors.anonymousNoteLimit> | null = null
): AnonymousNoteLimitPolicy {
  return {
    admit: vi
      .fn()
      .mockResolvedValue(admitted === null ? ok(undefined) : err(admitted)),
  } as unknown as AnonymousNoteLimitPolicy;
}

describe('RestoreNoteHandler', () => {
  it('delegates to the repository with the note id and user id', async () => {
    const restored = { id: 'n1', ownerId: 'owner' };
    const noteRepo = { restore: vi.fn().mockResolvedValue(ok(restored)) };

    const handler = new RestoreNoteHandler(noteRepo as never, noteLimitOf());
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(noteRepo.restore).toHaveBeenCalledWith('n1', 'owner');
  });

  it('propagates a not-found error from the repository', async () => {
    const noteRepo = {
      restore: vi.fn().mockResolvedValue(err(NoteErrors.noteNotFound('n1'))),
    };

    const handler = new RestoreNoteHandler(noteRepo as never, noteLimitOf());
    const result = await handler.execute({ noteId: 'n1', userId: 'intruder' });

    expect(result.isErr()).toBe(true);
  });

  it('refuses a restore the anonymous note limit does not admit, restoring nothing', async () => {
    const limit = NoteErrors.anonymousNoteLimit(5);
    const noteLimit = noteLimitOf(limit);
    const noteRepo = { restore: vi.fn() };

    const handler = new RestoreNoteHandler(noteRepo as never, noteLimit);
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result._unsafeUnwrapErr()).toBe(limit);
    expect(noteLimit.admit).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'owner' })
    );
    expect(noteRepo.restore).not.toHaveBeenCalled();
  });
});
