import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteImageStoreService } from './note-image-store.service';

const UPLOADED = {
  url: 'https://blob/notes/n1/photo-abc.png',
  pathname: 'notes/n1/photo-abc.png',
};

function setup() {
  const storage = {
    upload: vi.fn().mockResolvedValue(UPLOADED),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const imageRepo = {
    create: vi
      .fn()
      .mockImplementation((row) => Promise.resolve({ id: 'img1', ...row })),
    findPathnamesByNote: vi.fn(),
  };
  const service = new NoteImageStoreService(
    storage as never,
    imageRepo as never
  );
  return { service, storage, imageRepo };
}

const input = {
  noteId: 'n1',
  userId: 'owner',
  filename: 'photo.png',
  data: Buffer.from([1, 2, 3, 4, 5]),
  mimeType: 'image/png',
  width: 800,
  height: null,
} as const;

describe('NoteImageStoreService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads the bytes under the given type and records what was stored', async () => {
    const { service, storage, imageRepo } = setup();

    const row = await service.store(input);

    expect(storage.upload).toHaveBeenCalledWith({
      noteId: 'n1',
      filename: 'photo.png',
      data: input.data,
      contentType: 'image/png',
    });
    expect(imageRepo.create).toHaveBeenCalledWith({
      noteId: 'n1',
      userId: 'owner',
      pathname: UPLOADED.pathname,
      url: UPLOADED.url,
      size: 5,
      mimeType: 'image/png',
      width: 800,
      height: null,
    });
    expect(row).toMatchObject({ id: 'img1', url: UPLOADED.url });
  });

  it('deletes the uploaded blob when the row cannot be recorded', async () => {
    const { service, storage, imageRepo } = setup();
    imageRepo.create.mockRejectedValue(new Error('db down'));

    await expect(service.store(input)).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith([UPLOADED.pathname]);
  });

  it('logs the failed compensating delete and still reports the insert failure', async () => {
    const { service, storage, imageRepo } = setup();
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    imageRepo.create.mockRejectedValue(new Error('db down'));
    storage.delete.mockRejectedValue(new Error('blob down'));

    await expect(service.store(input)).rejects.toThrow('db down');
    expect(warn).toHaveBeenCalledWith(
      `Could not delete blob ${UPLOADED.pathname} of note n1 after its note_images insert failed: blob down`
    );
  });

  it('names the stored blob by the verified type, not the extension it came with', async () => {
    const { service, storage } = setup();

    await service.store({ ...input, filename: 'photo.gif' });

    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'photo.png' })
    );
  });

  it('records nothing when the upload fails', async () => {
    const { service, storage, imageRepo } = setup();
    storage.upload.mockRejectedValue(new Error('blob down'));

    await expect(service.store(input)).rejects.toThrow('blob down');
    expect(imageRepo.create).not.toHaveBeenCalled();
  });
});
