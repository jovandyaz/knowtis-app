import { describe, expect, it } from 'vitest';

import { hashSeed, seededShuffle } from './seeded-shuffle';

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('is deterministic for the same seed', () => {
    expect(seededShuffle(items, hashSeed('user-1:2026-09-06'))).toEqual(
      seededShuffle(items, hashSeed('user-1:2026-09-06'))
    );
  });

  it('changes order for a different seed and keeps every item', () => {
    const a = seededShuffle(items, hashSeed('user-1:2026-09-06'));
    const b = seededShuffle(items, hashSeed('user-1:2026-09-07'));
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual(items);
    expect([...b].sort()).toEqual(items);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    seededShuffle(items, 42);
    expect(items).toEqual(copy);
  });

  it('hashes to a 32-bit unsigned integer', () => {
    const hash = hashSeed('anything');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });
});
