import { describe, expect, it } from 'vitest';

import {
  IMAGE_MIME_TYPES,
  imageFilename,
  sniffImageType,
  type ImageMimeType,
} from './image-type';

const fromBase64 = (data: string) => Buffer.from(data, 'base64');
const fromText = (text: string) => Buffer.from(text, 'latin1');

const PNG_1X1 = fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
);
const WEBP_1X1 = fromBase64(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
);

const IMAGES: ReadonlyArray<readonly [string, Buffer, ImageMimeType]> = [
  ['a 1x1 PNG', PNG_1X1, 'image/png'],
  ['a JFIF JPEG header', fromBase64('/9j/4AAQSkZJRgABAQ'), 'image/jpeg'],
  ['an Exif JPEG header', fromBase64('/9j/4QAYRXhpZgAA'), 'image/jpeg'],
  [
    'a 1x1 GIF89a',
    fromBase64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
    'image/gif',
  ],
  [
    'a 1x1 GIF87a',
    fromBase64('R0lGODdhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUQAOw=='),
    'image/gif',
  ],
  ['a 1x1 WebP', WEBP_1X1, 'image/webp'],
];

const NOT_IMAGES: ReadonlyArray<readonly [string, Uint8Array]> = [
  [
    'SVG markup',
    fromText(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    ),
  ],
  [
    'SVG behind an XML prolog',
    fromText('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
  ],
  ['an HTML page', fromText('<!DOCTYPE html><html><body>hi</body></html>')],
  ['plain text', fromText('just some text')],
  ['an empty body', new Uint8Array()],
  ['a PNG cut after four bytes', PNG_1X1.subarray(0, 4)],
  ['a WebP cut before its WEBP tag', WEBP_1X1.subarray(0, 10)],
  ['a JPEG cut after two bytes', fromBase64('/9g=')],
  ['a RIFF file that is not WebP', fromText('RIFF$\u0000\u0000\u0000WAVEfmt ')],
  ['a GIF with an unknown version', fromText('GIF88a\u0001\u0000\u0001\u0000')],
  ['a BMP', fromText('BM6\u0000\u0000\u0000\u0000\u0000')],
];

describe('sniffImageType', () => {
  it.each(IMAGES)('recognises %s', (_label, data, expected) => {
    expect(sniffImageType(data)).toBe(expected);
  });

  it.each(NOT_IMAGES)('refuses %s', (_label, data) => {
    expect(sniffImageType(data)).toBeNull();
  });

  it('recognises every supported mime type from its bytes', () => {
    const recognised = new Set(IMAGES.map(([, data]) => sniffImageType(data)));

    expect(recognised).toEqual(new Set(IMAGE_MIME_TYPES));
  });
});

describe('imageFilename', () => {
  it.each([
    ['photo.gif', 'image/png', 'photo.png'],
    ['scan.jpeg', 'image/jpeg', 'scan.jpg'],
    ['diagram.png', 'image/webp', 'diagram.webp'],
    ['imported', 'image/gif', 'imported.gif'],
    ['archive.tar.gz', 'image/png', 'archive.tar.png'],
  ] as const)(
    'names %s holding %s as %s',
    (filename, type: ImageMimeType, expected) => {
      expect(imageFilename(filename, type)).toBe(expected);
    }
  );
});
