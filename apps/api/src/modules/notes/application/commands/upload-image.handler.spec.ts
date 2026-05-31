import { UserId } from '@jovandyaz/auth/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadImageHandler } from './upload-image.handler';

function setup(overrides: { ownerId?: string; hasAccess?: boolean } = {}) {
  const note = { id: 'n1', ownerId: overrides.ownerId ?? 'owner' };
  const noteRepo = { findById: vi.fn().mockResolvedValue(note) };
  const permRepo = {
    hasAccess: vi.fn().mockResolvedValue(overrides.hasAccess ?? false),
  };
  const storage = {
    upload: vi.fn().mockResolvedValue({
      url: 'https://blob/x.webp',
      pathname: 'notes/n1/x.webp',
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
    imageRepo as never,
    storage as never
  );
  return { handler, noteRepo, permRepo, storage, imageRepo };
}

const input = {
  noteId: 'n1',
  filename: 'p.webp',
  data: Buffer.from('x'),
  contentType: 'image/webp',
  size: 10,
  width: 800,
  height: 600,
};

describe('UploadImageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads and records a row when the user is the owner', async () => {
    const { handler, storage, imageRepo } = setup({ ownerId: 'owner' });
    const result = await handler.execute({ ...input, userId: 'owner' });
    expect(result.isOk()).toBe(true);
    expect(storage.upload).toHaveBeenCalled();
    expect(imageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'n1',
        userId: 'owner',
        url: 'https://blob/x.webp',
        mimeType: 'image/webp',
        width: 800,
        height: 600,
      })
    );
  });

  it('allows an editor with access', async () => {
    const { handler, permRepo } = setup({
      ownerId: 'someone',
      hasAccess: true,
    });
    const result = await handler.execute({ ...input, userId: 'editor' });
    expect(result.isOk()).toBe(true);
    expect(permRepo.hasAccess).toHaveBeenCalledWith(
      'n1',
      UserId.fromTrusted('editor'),
      'editor'
    );
  });

  it('rejects a user without write access (no upload)', async () => {
    const { handler, storage } = setup({
      ownerId: 'someone',
      hasAccess: false,
    });
    const result = await handler.execute({ ...input, userId: 'intruder' });
    expect(result.isErr()).toBe(true);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('errors when the note does not exist', async () => {
    const { handler, noteRepo } = setup();
    noteRepo.findById.mockResolvedValue(null);
    const result = await handler.execute({ ...input, userId: 'owner' });
    expect(result.isErr()).toBe(true);
  });

  it('deletes the uploaded blob when the DB insert fails (no orphan)', async () => {
    const { handler, storage, imageRepo } = setup({ ownerId: 'owner' });
    imageRepo.create.mockRejectedValue(new Error('db down'));

    await expect(
      handler.execute({ ...input, userId: 'owner' })
    ).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith(['notes/n1/x.webp']);
  });
});
