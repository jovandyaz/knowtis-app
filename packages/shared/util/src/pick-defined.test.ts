import { describe, expect, it } from 'vitest';

import { pickDefined } from './pick-defined';

describe('pickDefined', () => {
  it('should pick only defined properties', () => {
    const source = { a: 1, b: undefined, c: 'hello' };
    const result = pickDefined(source, ['a', 'b', 'c']);
    expect(result).toEqual({ a: 1, c: 'hello' });
  });

  it('should return empty object when all values are undefined', () => {
    const source = { a: undefined, b: undefined };
    const result = pickDefined(source, ['a', 'b']);
    expect(result).toEqual({});
  });

  it('should only pick specified keys', () => {
    const source = { a: 1, b: 2, c: 3 };
    const result = pickDefined(source, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should preserve falsy values that are not undefined', () => {
    const source = { a: 0, b: '', c: false, d: null };
    const result = pickDefined(source, ['a', 'b', 'c', 'd']);
    expect(result).toEqual({ a: 0, b: '', c: false, d: null });
  });

  it('should return empty object for empty keys array', () => {
    const source = { a: 1 };
    const result = pickDefined(source, []);
    expect(result).toEqual({});
  });
});
