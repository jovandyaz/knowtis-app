import { describe, expect, it } from 'vitest';

import { sanitizeFilename } from './filename.util';

describe('sanitizeFilename', () => {
  it('keeps a safe base name and extension', () => {
    expect(sanitizeFilename('My Photo.PNG')).toBe('my-photo.png');
  });
  it('strips path segments and unsafe chars', () => {
    expect(sanitizeFilename('../../etc/p@ss!.jpeg')).toBe('p-ss.jpeg');
  });
  it('falls back to "image" when name is empty after cleaning', () => {
    expect(sanitizeFilename('***')).toBe('image');
  });
});
