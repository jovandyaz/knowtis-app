import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { NoteErrors } from '../../domain/errors/note.errors';
import type { NoteAdmission } from '../../domain/ports/note-write.repository';
import type { AnonymousNoteLimitPolicy } from '../anonymous-note-limit.policy';
import { RestoreNoteHandler } from './restore-note.handler';

function noteLimitOf(admission: NoteAdmission = {}): AnonymousNoteLimitPolicy {
  return {
    admissionFor: vi.fn().mockResolvedValue(admission),
  } as unknown as AnonymousNoteLimitPolicy;
}

describe('RestoreNoteHandler', () => {
  it('delegates to the repository with the note id, user id and the owner admission', async () => {
    const restored = { id: 'n1', ownerId: 'owner' };
    const noteRepo = { restore: vi.fn().mockResolvedValue(ok(restored)) };

    const handler = new RestoreNoteHandler(noteRepo as never, noteLimitOf());
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(noteRepo.restore).toHaveBeenCalledWith('n1', 'owner', {});
  });

  it('propagates a not-found error from the repository', async () => {
    const noteRepo = {
      restore: vi.fn().mockResolvedValue(err(NoteErrors.noteNotFound('n1'))),
    };

    const handler = new RestoreNoteHandler(noteRepo as never, noteLimitOf());
    const result = await handler.execute({ noteId: 'n1', userId: 'intruder' });

    expect(result.isErr()).toBe(true);
  });

  it('hands the owner note cap to the restore and returns the refusal it enforces', async () => {
    const limit = NoteErrors.anonymousNoteLimit(5);
    const noteLimit = noteLimitOf({ anonymousNoteCap: 5 });
    const noteRepo = { restore: vi.fn().mockResolvedValue(err(limit)) };

    const handler = new RestoreNoteHandler(noteRepo as never, noteLimit);
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result._unsafeUnwrapErr()).toBe(limit);
    expect(noteLimit.admissionFor).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'owner' })
    );
    expect(noteRepo.restore).toHaveBeenCalledWith('n1', 'owner', {
      anonymousNoteCap: 5,
    });
  });
});
