import { describe, expect, it, vi } from 'vitest';

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

  it('still reports the insert failure when the compensating delete fails too', async () => {
    const { service, storage, imageRepo } = setup();
    imageRepo.create.mockRejectedValue(new Error('db down'));
    storage.delete.mockRejectedValue(new Error('blob down'));

    await expect(service.store(input)).rejects.toThrow('db down');
  });

  it('records nothing when the upload fails', async () => {
    const { service, storage, imageRepo } = setup();
    storage.upload.mockRejectedValue(new Error('blob down'));

    await expect(service.store(input)).rejects.toThrow('blob down');
    expect(imageRepo.create).not.toHaveBeenCalled();
  });
});
