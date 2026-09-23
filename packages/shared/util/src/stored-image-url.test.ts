import { describe, expect, it } from 'vitest';

import { isStoredImageUrl } from './stored-image-url';

describe('isStoredImageUrl', () => {
  it.each([
    'https://knowtis.public.blob.vercel-storage.com/notes/n1/photo-abc.webp',
    'https://a1b2c3.public.blob.vercel-storage.com/x.png?download=1',
  ])('accepts an image the blob store served: %s', (url) => {
    expect(isStoredImageUrl(url)).toBe(true);
  });

  it.each([
    ['http, not https', 'http://knowtis.public.blob.vercel-storage.com/x.webp'],
    ['another host', 'https://attacker.example/collect?d=secret'],
    [
      'the store name in the path',
      'https://attacker.example/knowtis.public.blob.vercel-storage.com/x.webp',
    ],
    [
      'the store name as a subdomain prefix',
      'https://knowtis.public.blob.vercel-storage.com.attacker.example/x.webp',
    ],
    [
      'the suffix with no store',
      'https://.public.blob.vercel-storage.com/x.webp',
    ],
    ['the bare suffix', 'https://public.blob.vercel-storage.com/x.webp'],
    [
      'userinfo before the real host',
      'https://knowtis.public.blob.vercel-storage.com@attacker.example/x.webp',
    ],
    ['a data url', 'data:image/png;base64,AAAA'],
    ['a relative path', '/notes/n1/x.webp'],
    ['not a url', 'knowtis.public.blob.vercel-storage.com'],
  ])('rejects %s', (_label, url) => {
    expect(isStoredImageUrl(url)).toBe(false);
  });
});
