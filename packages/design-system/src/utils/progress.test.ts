import { describe, expect, it } from 'vitest';

import { clampProgress, PROGRESS_MAX_FLOOR } from './progress';

describe('clampProgress', () => {
  it('clamps a normal value within a positive max', () => {
    expect(clampProgress(3, 10)).toEqual({
      safeMax: 10,
      clamped: 3,
      ratio: 0.3,
    });
  });

  it('floors a zero max to the minimum, avoiding a division by zero', () => {
    expect(clampProgress(0, 0)).toEqual({
      safeMax: PROGRESS_MAX_FLOOR,
      clamped: 0,
      ratio: 0,
    });
  });

  it('floors a negative max to the minimum', () => {
    expect(clampProgress(0, -3)).toEqual({
      safeMax: PROGRESS_MAX_FLOOR,
      clamped: 0,
      ratio: 0,
    });
  });

  it('clamps a value above max down to max', () => {
    expect(clampProgress(12, 10)).toEqual({
      safeMax: 10,
      clamped: 10,
      ratio: 1,
    });
  });

  it('floors a NaN max to the minimum instead of propagating NaN', () => {
    expect(clampProgress(5, NaN)).toEqual({
      safeMax: PROGRESS_MAX_FLOOR,
      clamped: 1,
      ratio: 1,
    });
  });

  it('floors an infinite max to the minimum', () => {
    expect(clampProgress(5, Infinity)).toEqual({
      safeMax: PROGRESS_MAX_FLOOR,
      clamped: 1,
      ratio: 1,
    });
  });

  it('reads a NaN value as zero instead of propagating NaN', () => {
    expect(clampProgress(NaN, 10)).toEqual({
      safeMax: 10,
      clamped: 0,
      ratio: 0,
    });
  });

  it('reads an infinite value as zero instead of pinning progress full', () => {
    expect(clampProgress(Infinity, 10)).toEqual({
      safeMax: 10,
      clamped: 0,
      ratio: 0,
    });
  });
});
