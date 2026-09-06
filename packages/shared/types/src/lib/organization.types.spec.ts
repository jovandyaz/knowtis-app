import { describe, expect, it } from 'vitest';

import { isTagColor, isWithinBranch, TAG_COLORS } from './organization.types';

describe('isWithinBranch', () => {
  it.each([
    ['work', 'work', true],
    ['work/alpha', 'work', true],
    ['work/alpha/deep', 'work', true],
    ['workshop', 'work', false],
    ['work', 'work/alpha', false],
  ])('should report %j within %j as %s', (path, branch, expected) => {
    expect(isWithinBranch(path, branch)).toBe(expected);
  });
});

describe('isTagColor', () => {
  it.each(TAG_COLORS)('should accept the %s palette token', (color) => {
    expect(isTagColor(color)).toBe(true);
  });

  it.each([['#ff0000'], ['PURPLE'], [''], [null], [undefined], [7]])(
    'should reject %j, which the palette cannot represent',
    (value) => {
      expect(isTagColor(value)).toBe(false);
    }
  );
});
