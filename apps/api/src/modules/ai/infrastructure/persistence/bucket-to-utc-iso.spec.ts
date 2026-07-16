import { describe, expect, it } from 'vitest';

import { bucketToUtcIso } from './drizzle-ai-usage.repository';

describe('bucketToUtcIso', () => {
  it('normalizes a date_trunc string bucket to a UTC ISO string', () => {
    expect(bucketToUtcIso('2026-07-16 05:00:00')).toBe(
      '2026-07-16T05:00:00.000Z'
    );
  });

  it('normalizes a Date bucket whose local components carry the intended UTC instant', () => {
    const bucket = new Date(2026, 6, 16, 5, 0, 0);
    expect(bucketToUtcIso(bucket)).toBe('2026-07-16T05:00:00.000Z');
  });
});
