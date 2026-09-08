import { describe, expect, it } from 'vitest';

import { STUDY_DURATION_BUCKETS } from '@knowtis/shared-types';

import { studyDurationBucket } from './study-duration-bucket';

const MINUTE_MS = 60_000;
const SWEEP_LIMIT_MIN = 30;

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

  it('passes through every bucket the shared list declares, in order', () => {
    const walked = Array.from({ length: SWEEP_LIMIT_MIN + 1 }, (_, minutes) =>
      studyDurationBucket(minutes * MINUTE_MS)
    );

    expect(
      walked.filter(
        (bucket, index) => index === 0 || bucket !== walked[index - 1]
      )
    ).toEqual([...STUDY_DURATION_BUCKETS]);
  });
});
