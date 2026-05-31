import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { DeleteNoteHandler } from './delete-note.handler';

describe('DeleteNoteHandler image cleanup', () => {
  it('deletes the note images blobs when the owner deletes the note', async () => {
    const noteRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'n1', ownerId: 'owner' }),
      delete: vi.fn().mockResolvedValue(ok(true)),
    };
    const imageRepo = {
      findPathnamesByNote: vi
        .fn()
        .mockResolvedValue(['notes/n1/a.webp', 'notes/n1/b.webp']),
    };
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    const handler = new DeleteNoteHandler(
      noteRepo as never,
      imageRepo as never,
      storage as never
    );
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(imageRepo.findPathnamesByNote).toHaveBeenCalledWith('n1');
    expect(storage.delete).toHaveBeenCalledWith([
      'notes/n1/a.webp',
      'notes/n1/b.webp',
    ]);
    expect(noteRepo.delete).toHaveBeenCalledWith('n1');
  });

  it('still deletes the note row when blob cleanup throws', async () => {
    const noteRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'n1', ownerId: 'owner' }),
      delete: vi.fn().mockResolvedValue(ok(true)),
    };
    const imageRepo = {
      findPathnamesByNote: vi.fn().mockResolvedValue(['notes/n1/a.webp']),
    };
    const storage = {
      delete: vi.fn().mockRejectedValue(new Error('blob unreachable')),
    };

    const handler = new DeleteNoteHandler(
      noteRepo as never,
      imageRepo as never,
      storage as never
    );
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(noteRepo.delete).toHaveBeenCalledWith('n1');
  });

  it('returns permission denied for a non-owner', async () => {
    const noteRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'n1', ownerId: 'owner' }),
      delete: vi.fn(),
    };
    const imageRepo = { findPathnamesByNote: vi.fn() };
    const storage = { delete: vi.fn() };

    const handler = new DeleteNoteHandler(
      noteRepo as never,
      imageRepo as never,
      storage as never
    );
    const result = await handler.execute({ noteId: 'n1', userId: 'intruder' });

    expect(result.isErr()).toBe(true);
    expect(imageRepo.findPathnamesByNote).not.toHaveBeenCalled();
    expect(noteRepo.delete).not.toHaveBeenCalled();
  });
});
