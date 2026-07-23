import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { DeleteNoteHandler } from './delete-note.handler';

describe('DeleteNoteHandler', () => {
  it('soft-deletes via the repository when the owner deletes', async () => {
    const noteRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'n1', ownerId: 'owner' }),
      delete: vi.fn().mockResolvedValue(ok(true)),
    };

    const handler = new DeleteNoteHandler(noteRepo as never);
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(noteRepo.delete).toHaveBeenCalledWith('n1');
  });

  it('returns not-found when the note does not exist', async () => {
    const noteRepo = {
      findById: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    };

    const handler = new DeleteNoteHandler(noteRepo as never);
    const result = await handler.execute({
      noteId: 'missing',
      userId: 'owner',
    });

    expect(result.isErr()).toBe(true);
    expect(noteRepo.delete).not.toHaveBeenCalled();
  });

  it('returns permission denied for a non-owner', async () => {
    const noteRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'n1', ownerId: 'owner' }),
      delete: vi.fn(),
    };

    const handler = new DeleteNoteHandler(noteRepo as never);
    const result = await handler.execute({ noteId: 'n1', userId: 'intruder' });

    expect(result.isErr()).toBe(true);
    expect(noteRepo.delete).not.toHaveBeenCalled();
  });
});
