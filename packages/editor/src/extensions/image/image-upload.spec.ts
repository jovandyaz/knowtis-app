import { describe, expect, it } from 'vitest';

import { IMAGE_MIME_TYPES } from '@knowtis/shared-util';

import { extractImageFiles } from './image-upload';

function fileOfType(type: string): File {
  return new File([new Uint8Array([1, 2, 3])], `x.${type.split('/')[1]}`, {
    type,
  });
}

describe('extractImageFiles', () => {
  it('keeps only accepted image types', () => {
    const list = [
      fileOfType('image/png'),
      fileOfType('image/webp'),
      fileOfType('image/gif'),
      fileOfType('application/pdf'),
      fileOfType('text/plain'),
    ];
    const result = extractImageFiles(list);
    expect(result.map((f) => f.type)).toEqual([
      'image/png',
      'image/webp',
      'image/gif',
    ]);
  });

  it('returns empty for no images', () => {
    expect(extractImageFiles([fileOfType('application/json')])).toEqual([]);
  });

  it('accepts every type in the allowlist', () => {
    for (const type of IMAGE_MIME_TYPES) {
      expect(extractImageFiles([fileOfType(type)])).toHaveLength(1);
    }
  });
});
