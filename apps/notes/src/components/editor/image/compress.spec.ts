import { describe, expect, it } from 'vitest';

import { computeTargetSize, MAX_DIMENSION } from './compress';

describe('computeTargetSize', () => {
  it('leaves small images unchanged', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('scales down a wide image to the max long side', () => {
    expect(computeTargetSize(3200, 1600)).toEqual({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION / 2,
    });
  });
  it('scales down a tall image to the max long side', () => {
    expect(computeTargetSize(1000, 4000)).toEqual({
      width: 400,
      height: MAX_DIMENSION,
    });
  });
  it('leaves an image at exactly the max dimension unchanged', () => {
    expect(computeTargetSize(MAX_DIMENSION, 900)).toEqual({
      width: MAX_DIMENSION,
      height: 900,
    });
  });
  it('scales a square image proportionally', () => {
    expect(computeTargetSize(3200, 3200)).toEqual({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
    });
  });
});
