import { describe, expect, it } from 'vitest';

import { studyDurationBucket } from './study-duration-bucket';

const MINUTE_MS = 60_000;

describe('studyDurationBucket', () => {
  it('buckets a session under two minutes as <2m', () => {
    expect(studyDurationBucket(0)).toBe('<2m');
    expect(studyDurationBucket(2 * MINUTE_MS - 1)).toBe('<2m');
  });

  it('buckets exactly two minutes as 2-5m', () => {
    expect(studyDurationBucket(2 * MINUTE_MS)).toBe('2-5m');
  });

  it('buckets just under five minutes as 2-5m', () => {
    expect(studyDurationBucket(5 * MINUTE_MS - 1)).toBe('2-5m');
  });

  it('buckets exactly five minutes as 5-15m', () => {
    expect(studyDurationBucket(5 * MINUTE_MS)).toBe('5-15m');
  });

  it('buckets just under fifteen minutes as 5-15m', () => {
    expect(studyDurationBucket(15 * MINUTE_MS - 1)).toBe('5-15m');
  });

  it('buckets exactly fifteen minutes and beyond as >15m', () => {
    expect(studyDurationBucket(15 * MINUTE_MS)).toBe('>15m');
    expect(studyDurationBucket(20 * MINUTE_MS)).toBe('>15m');
  });
});
