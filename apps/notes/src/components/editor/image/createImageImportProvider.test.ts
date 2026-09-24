import { beforeEach, describe, expect, it, vi } from 'vitest';

import { imagesApi } from '@knowtis/api-client';
import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { createImageImportProvider } from './createImageImportProvider';

vi.mock('@knowtis/api-client', () => ({
  imagesApi: { import: vi.fn() },
}));

const PASTED_URL = 'https://example.com/chart.png';
const STORED_URL = `https://${STORED_IMAGE_HOST}/notes/note-1/imported-a1.png`;

describe('createImageImportProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the pasted url into the current note and answers with the stored copy', async () => {
    vi.mocked(imagesApi.import).mockResolvedValue({
      id: 'image-1',
      url: STORED_URL,
      width: 640,
      height: 480,
    });
    let noteId = 'note-1';
    const provider = createImageImportProvider(() => noteId);
    noteId = 'note-2';
    const controller = new AbortController();

    await expect(provider(PASTED_URL, controller.signal)).resolves.toEqual({
      src: STORED_URL,
      width: 640,
      height: 480,
      alt: '',
    });
    expect(imagesApi.import).toHaveBeenCalledWith({
      noteId: 'note-2',
      url: PASTED_URL,
      signal: controller.signal,
    });
  });

  it('rejects when the API refuses the import', async () => {
    const refusal = new Error('fetch_failed');
    vi.mocked(imagesApi.import).mockRejectedValue(refusal);
    const provider = createImageImportProvider(() => 'note-1');

    await expect(
      provider(PASTED_URL, new AbortController().signal)
    ).rejects.toBe(refusal);
  });
});
