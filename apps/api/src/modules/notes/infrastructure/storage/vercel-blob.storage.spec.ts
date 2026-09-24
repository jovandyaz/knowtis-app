import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import type { EnvConfig } from '../../../../config/env.config';
import { VercelBlobStorage } from './vercel-blob.storage';

const STORED_URL = `https://${STORED_IMAGE_HOST}/notes/n1/x-abc.webp`;
const FOREIGN_URL =
  'https://otherstore123.public.blob.vercel-storage.com/notes/n1/x-abc.webp';
const UPLOAD = {
  noteId: 'n1',
  filename: 'photo.webp',
  data: Buffer.from('x'),
  contentType: 'image/webp',
};

const put = vi.fn();
const del = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
}));

function makeStorage(token: string | undefined) {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'VERCEL_BLOB_READ_WRITE_TOKEN' && token) {
        return token;
      }
      throw new Error(`Missing ${key}`);
    },
  } as unknown as ConfigService<EnvConfig, true>;
  return new VercelBlobStorage(config);
}

describe('VercelBlobStorage', () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads to a note-scoped public path and returns url + pathname', async () => {
    put.mockResolvedValue({
      url: STORED_URL,
      pathname: 'notes/n1/x-abc.webp',
    });
    const storage = makeStorage('vercel_blob_token');

    const result = await storage.upload(UPLOAD);

    expect(put).toHaveBeenCalledWith(
      'notes/n1/photo.webp',
      expect.any(Buffer),
      expect.objectContaining({
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/webp',
        token: 'vercel_blob_token',
      })
    );
    expect(result).toEqual({
      url: STORED_URL,
      pathname: 'notes/n1/x-abc.webp',
    });
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes the blob and throws when the token belongs to another store', async () => {
    put.mockResolvedValue({
      url: FOREIGN_URL,
      pathname: 'notes/n1/x-abc.webp',
    });
    del.mockResolvedValue(undefined);
    const storage = makeStorage('vercel_blob_token');

    await expect(storage.upload(UPLOAD)).rejects.toThrow(
      new RegExp(`otherstore123.*${STORED_IMAGE_HOST}`)
    );
    expect(del).toHaveBeenCalledWith(
      ['notes/n1/x-abc.webp'],
      expect.objectContaining({ token: 'vercel_blob_token' })
    );
  });

  it('still reports the store mismatch when deleting the blob fails', async () => {
    put.mockResolvedValue({
      url: FOREIGN_URL,
      pathname: 'notes/n1/x-abc.webp',
    });
    del.mockRejectedValue(new Error('network down'));
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const storage = makeStorage('vercel_blob_token');

    await expect(storage.upload(UPLOAD)).rejects.toThrow(
      /VERCEL_BLOB_READ_WRITE_TOKEN/
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining('notes/n1/x-abc.webp')
    );
    expect(warn.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining('network down')
    );
  });

  it('reports the store mismatch when the returned url does not parse', async () => {
    put.mockResolvedValue({
      url: 'not a url',
      pathname: 'notes/n1/x-abc.webp',
    });
    del.mockResolvedValue(undefined);
    const storage = makeStorage('vercel_blob_token');

    await expect(storage.upload(UPLOAD)).rejects.toThrow(
      /not a url.*VERCEL_BLOB_READ_WRITE_TOKEN belongs to another Blob store/
    );
  });

  it('throws when the token is missing', async () => {
    const storage = makeStorage(undefined);
    await expect(
      storage.upload({
        noteId: 'n1',
        filename: 'a.webp',
        data: Buffer.from('x'),
        contentType: 'image/webp',
      })
    ).rejects.toThrow(/VERCEL_BLOB_READ_WRITE_TOKEN/);
  });

  it('skips del when there are no pathnames', async () => {
    const storage = makeStorage('t');
    await storage.delete([]);
    expect(del).not.toHaveBeenCalled();
  });

  it('forwards pathnames and token to del()', async () => {
    del.mockResolvedValue(undefined);
    const storage = makeStorage('vercel_blob_token');
    await storage.delete(['notes/n1/a.webp', 'notes/n1/b.webp']);
    expect(del).toHaveBeenCalledWith(
      ['notes/n1/a.webp', 'notes/n1/b.webp'],
      expect.objectContaining({ token: 'vercel_blob_token' })
    );
  });
});
