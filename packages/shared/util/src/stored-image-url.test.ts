import { describe, expect, it } from 'vitest';

import { isStoredImageUrl, STORED_IMAGE_HOST } from './stored-image-url';

describe('isStoredImageUrl', () => {
  it('pins the app blob store host', () => {
    expect(STORED_IMAGE_HOST).toBe(
      'iy4r311mpkfdcnup.public.blob.vercel-storage.com'
    );
  });

  it.each([
    'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    'https://IY4R311MPKFDCNUP.PUBLIC.BLOB.VERCEL-STORAGE.COM/a.png',
    'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/photo-abc.webp?download=1',
    'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com:443/a.png',
    '  https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png  ',
  ])('accepts an image the app blob store served: %s', (url) => {
    expect(isStoredImageUrl(url)).toBe(true);
  });

  it.each([
    [
      'another blob store',
      'https://attacker123.public.blob.vercel-storage.com/a.png',
    ],
    [
      'http, not https',
      'http://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    ],
    ['another host', 'https://attacker.example/collect?d=secret'],
    [
      'the store host as a subdomain prefix',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com.evil.com/a.png',
    ],
    [
      'the store host in the query',
      'https://evil.com/?h=iy4r311mpkfdcnup.public.blob.vercel-storage.com',
    ],
    [
      'the store host in the path',
      'https://evil.com/iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    ],
    [
      'userinfo before the real host',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com@evil.com/a.png',
    ],
    [
      'a non-default port on our host',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com:8443/a.png',
    ],
    [
      'userinfo on our host',
      'https://user:pass@iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    ],
    [
      'a username on our host',
      'https://user@iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    ],
    [
      'a trailing dot on the host',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com./a.png',
    ],
    [
      'a backslash hiding the real host',
      'https://evil.com\\@iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    ],
    [
      'an IDN look-alike host',
      'https://iy4r311mpkfdcnup.public.blob.vercel-stor\u0430ge.com/a.png',
    ],
    [
      'a punycode look-alike host',
      'https://xn--iy4r311mpkfdcnup-.public.blob.vercel-storage.com/a.png',
    ],
    [
      'whitespace inside the host',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com .evil.com/a.png',
    ],
    ['the bare blob domain', 'https://public.blob.vercel-storage.com/a.png'],
    ['a relative path', '/t/x.png'],
    ['a data url', 'data:image/png;base64,AAAA'],
    ['a blob url', 'blob:https://knowtis.app/0b1c2d3e'],
    ['an empty string', ''],
    ['garbage', 'not a url at all'],
    [
      'the host without a scheme',
      'iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.png',
    ],
  ])('rejects %s', (_label, url) => {
    expect(isStoredImageUrl(url)).toBe(false);
  });
});
