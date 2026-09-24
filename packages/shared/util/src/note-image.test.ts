import { describe, expect, it } from 'vitest';

import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from './note-image';

describe('the image contract of a note', () => {
  it('stores PNG, JPEG, GIF and WebP images, never SVG', () => {
    expect(IMAGE_MIME_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ]);
  });

  it('stores an image of at most 10 MiB', () => {
    expect(MAX_IMAGE_BYTES).toBe(10_485_760);
  });
});
