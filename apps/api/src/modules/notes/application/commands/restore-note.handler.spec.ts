import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { NoteErrors } from '../../domain';
import { RestoreNoteHandler } from './restore-note.handler';

describe('RestoreNoteHandler', () => {
  it('delegates to the repository with the note id and user id', async () => {
    const restored = { id: 'n1', ownerId: 'owner' };
    const noteRepo = { restore: vi.fn().mockResolvedValue(ok(restored)) };

    const handler = new RestoreNoteHandler(noteRepo as never);
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(noteRepo.restore).toHaveBeenCalledWith('n1', 'owner');
  });

  it('propagates a not-found error from the repository', async () => {
    const noteRepo = {
      restore: vi.fn().mockResolvedValue(err(NoteErrors.noteNotFound('n1'))),
    };

    const handler = new RestoreNoteHandler(noteRepo as never);
    const result = await handler.execute({ noteId: 'n1', userId: 'intruder' });

    expect(result.isErr()).toBe(true);
  });
});
