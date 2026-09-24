import { describe, expect, it, vi } from 'vitest';

import { NoteErrorCodes } from '../../domain';
import { NoteImageStoreService } from '../services/note-image-store.service';
import { UploadImageHandler } from './upload-image.handler';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function setup(overrides: { ownerId?: string; hasAccess?: boolean } = {}) {
  const note = { id: 'n1', ownerId: overrides.ownerId ?? 'owner' };
  const noteRepo = { findById: vi.fn().mockResolvedValue(note) };
  const permRepo = {
    hasAccess: vi.fn().mockResolvedValue(overrides.hasAccess ?? false),
  };
  const storage = {
    upload: vi.fn().mockResolvedValue({
      url: 'https://blob/x.png',
      pathname: 'notes/n1/x.png',
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const imageRepo = {
    create: vi
      .fn()
      .mockImplementation((d) => Promise.resolve({ id: 'img1', ...d })),
    findPathnamesByNote: vi.fn(),
  };
  const handler = new UploadImageHandler(
    noteRepo as never,
    permRepo as never,
    new NoteImageStoreService(storage as never, imageRepo as never)
  );
  return { handler, noteRepo, permRepo, storage, imageRepo };
}

const input = {
  noteId: 'n1',
  filename: 'p.png',
  data: PNG_BYTES,
  width: 800,
  height: 600,
};

describe('UploadImageHandler', () => {
  it('uploads and records a row when the user is the owner', async () => {
    const { handler, imageRepo } = setup({ ownerId: 'owner' });

    const result = await handler.execute({ ...input, userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(imageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'n1',
        userId: 'owner',
        url: 'https://blob/x.png',
        size: PNG_BYTES.byteLength,
        width: 800,
        height: 600,
      })
    );
  });

  it('stores the type the bytes carry, not the one the file name claims', async () => {
    const { handler, storage, imageRepo } = setup({ ownerId: 'owner' });

    await handler.execute({ ...input, filename: 'p.gif', userId: 'owner' });

    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/png' })
    );
    expect(imageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' })
    );
  });

  it('records missing dimensions as null', async () => {
    const { handler, imageRepo } = setup({ ownerId: 'owner' });

    await handler.execute({
      noteId: 'n1',
      filename: 'p.png',
      data: PNG_BYTES,
      userId: 'owner',
    });

    expect(imageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ width: null, height: null })
    );
  });

  it.each([
    ['a text file', Buffer.from('just some text')],
    ['SVG markup', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ])('refuses %s without uploading it', async (_label, data) => {
    const { handler, storage, imageRepo } = setup({ ownerId: 'owner' });

    const result = await handler.execute({ ...input, data, userId: 'owner' });

    expect(result.isErr() && result.error.code).toBe(
      NoteErrorCodes.UNSUPPORTED_IMAGE_TYPE
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(imageRepo.create).not.toHaveBeenCalled();
  });

  it('allows an editor with access', async () => {
    const { handler, storage, imageRepo } = setup({
      ownerId: 'someone',
      hasAccess: true,
    });

    const result = await handler.execute({ ...input, userId: 'editor' });

    expect(result.isOk()).toBe(true);
    expect(storage.upload).toHaveBeenCalled();
    expect(imageRepo.create).toHaveBeenCalled();
  });

  it('rejects a user without write access (no upload)', async () => {
    const { handler, storage } = setup({
      ownerId: 'someone',
      hasAccess: false,
    });

    const result = await handler.execute({ ...input, userId: 'intruder' });

    expect(result.isErr() && result.error.code).toBe(
      NoteErrorCodes.PERMISSION_DENIED
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('errors when the note does not exist', async () => {
    const { handler, noteRepo, storage } = setup();
    noteRepo.findById.mockResolvedValue(null);

    const result = await handler.execute({ ...input, userId: 'owner' });

    expect(result.isErr() && result.error.code).toBe(
      NoteErrorCodes.NOTE_NOT_FOUND
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
