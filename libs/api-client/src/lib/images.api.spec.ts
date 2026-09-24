import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from './http-client';
import { imagesApi } from './images.api';

vi.mock('./http-client', () => ({
  httpClient: { post: vi.fn() },
}));

const IMPORTED = {
  id: null,
  url: 'https://store.test/notes/n1/imported-a.png',
  width: null,
  height: null,
};

describe('imagesApi.import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the url as JSON to the note import route and returns the stored image', async () => {
    vi.mocked(httpClient.post).mockResolvedValue(IMPORTED);
    const controller = new AbortController();

    const result = await imagesApi.import({
      noteId: 'note 1',
      url: 'https://example.com/a.png',
      signal: controller.signal,
    });

    expect(result).toEqual(IMPORTED);
    expect(httpClient.post).toHaveBeenCalledWith(
      '/notes/note%201/images/import',
      { url: 'https://example.com/a.png' },
      { signal: controller.signal }
    );
  });

  it('sends no request options without a signal', async () => {
    vi.mocked(httpClient.post).mockResolvedValue(IMPORTED);

    await imagesApi.import({ noteId: 'n1', url: 'https://example.com/a.png' });

    expect(httpClient.post).toHaveBeenCalledWith(
      '/notes/n1/images/import',
      { url: 'https://example.com/a.png' },
      undefined
    );
  });

  it('rejects when the API refuses the import', async () => {
    const refusal = new Error('fetch_failed');
    vi.mocked(httpClient.post).mockRejectedValue(refusal);

    await expect(
      imagesApi.import({ noteId: 'n1', url: 'https://example.com/a.png' })
    ).rejects.toBe(refusal);
  });
});
