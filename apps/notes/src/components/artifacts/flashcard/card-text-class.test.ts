import { describe, expect, it } from 'vitest';

import { getCardTextClass } from './card-text-class';

describe('getCardTextClass', () => {
  it.each([0, 1, 80])(
    'uses the short reading scale for %i characters',
    (length) => {
      expect(getCardTextClass('x'.repeat(length))).toBe(
        'font-serif text-2xl lg:text-3xl leading-snug text-center text-balance'
      );
    }
  );
  it.each([81, 200])(
    'uses the medium reading scale for %i characters',
    (length) => {
      expect(getCardTextClass('x'.repeat(length))).toBe(
        'font-serif text-xl lg:text-2xl leading-snug text-center text-balance'
      );
    }
  );
  it.each([201, 1000])(
    'left aligns long reading material at %i characters',
    (length) => {
      expect(getCardTextClass('x'.repeat(length))).toBe(
        'font-serif text-lg lg:text-xl leading-relaxed text-left'
      );
    }
  );
});
