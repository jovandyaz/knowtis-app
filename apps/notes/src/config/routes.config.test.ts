import { describe, expect, it } from 'vitest';

import { sharedNotePath } from './routes.config';

describe('sharedNotePath', () => {
  it('builds the concrete path for a share token', () => {
    expect(sharedNotePath('23ba4124f05841ee64355804a39aa513')).toBe(
      '/s/23ba4124f05841ee64355804a39aa513'
    );
  });

  it.each(["$'", '$&', '$`', '$$'])(
    'inserts %s verbatim instead of expanding it as a replacement pattern',
    (token) => {
      expect(sharedNotePath(token)).toBe(`/s/${encodeURIComponent(token)}`);
    }
  );

  it('encodes characters that would otherwise change the URL structure', () => {
    expect(sharedNotePath('a?b#c/d')).toBe('/s/a%3Fb%23c%2Fd');
  });
});
