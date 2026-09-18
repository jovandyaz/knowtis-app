import { describe, expect, it } from 'vitest';

import { clampWidth, readPersistedWidth } from './persisted-width';

const BOUNDS = { min: 224, max: 360, fallback: 272 };

describe('readPersistedWidth', () => {
  it('returns an in-range value unchanged', () => {
    expect(readPersistedWidth(300, BOUNDS)).toBe(300);
  });

  it('returns the minimum boundary unchanged', () => {
    expect(readPersistedWidth(224, BOUNDS)).toBe(224);
  });

  it('returns the maximum boundary unchanged', () => {
    expect(readPersistedWidth(360, BOUNDS)).toBe(360);
  });

  it('falls back for a value below the range', () => {
    expect(readPersistedWidth(223, BOUNDS)).toBe(272);
  });

  it('falls back for a value above the range', () => {
    expect(readPersistedWidth(361, BOUNDS)).toBe(272);
  });

  it('falls back for NaN', () => {
    expect(readPersistedWidth(NaN, BOUNDS)).toBe(272);
  });

  it('falls back for Infinity', () => {
    expect(readPersistedWidth(Infinity, BOUNDS)).toBe(272);
  });

  it('falls back for a numeric string', () => {
    expect(readPersistedWidth('300', BOUNDS)).toBe(272);
  });

  it('falls back for null', () => {
    expect(readPersistedWidth(null, BOUNDS)).toBe(272);
  });

  it('falls back for undefined', () => {
    expect(readPersistedWidth(undefined, BOUNDS)).toBe(272);
  });
});

describe('clampWidth', () => {
  it('returns an in-range value unchanged', () => {
    expect(clampWidth(300, BOUNDS)).toBe(300);
  });

  it('returns the minimum boundary unchanged', () => {
    expect(clampWidth(224, BOUNDS)).toBe(224);
  });

  it('returns the maximum boundary unchanged', () => {
    expect(clampWidth(360, BOUNDS)).toBe(360);
  });

  it('clamps a value below the range up to the minimum', () => {
    expect(clampWidth(100, BOUNDS)).toBe(224);
  });

  it('clamps a value above the range down to the maximum', () => {
    expect(clampWidth(1000, BOUNDS)).toBe(360);
  });

  it('ignores NaN', () => {
    expect(clampWidth(NaN, BOUNDS)).toBeUndefined();
  });

  it('ignores Infinity', () => {
    expect(clampWidth(Infinity, BOUNDS)).toBeUndefined();
  });

  it('ignores -Infinity', () => {
    expect(clampWidth(-Infinity, BOUNDS)).toBeUndefined();
  });
});
