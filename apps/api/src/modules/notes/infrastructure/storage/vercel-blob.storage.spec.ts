import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { VercelBlobStorage } from './vercel-blob.storage';

const put = vi.fn();
const del = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
}));

function makeStorage(token: string | undefined) {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'VERCEL_BLOB_READ_WRITE_TOKEN' && token) {return token;}
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

  it('uploads to a note-scoped public path and returns url + pathname', async () => {
    put.mockResolvedValue({
      url: 'https://blob/x.webp',
      pathname: 'notes/n1/x-abc.webp',
    });
    const storage = makeStorage('vercel_blob_token');

    const result = await storage.upload({
      noteId: 'n1',
      filename: 'photo.webp',
      data: Buffer.from('x'),
      contentType: 'image/webp',
    });

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
      url: 'https://blob/x.webp',
      pathname: 'notes/n1/x-abc.webp',
    });
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
});
