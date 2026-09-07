import { describe, expect, it } from 'vitest';

import { computeStreak, localDateKey } from './study-streak';

describe('localDateKey', () => {
  it('formats the local calendar day for a zone west of UTC', () => {
    const instant = new Date('2026-09-07T03:30:00.000Z');
    expect(localDateKey(instant, 'America/Mexico_City')).toBe('2026-09-06');
    expect(localDateKey(instant, 'UTC')).toBe('2026-09-07');
  });

  it('formats the local calendar day for a zone east of UTC', () => {
    const instant = new Date('2026-09-06T20:00:00.000Z');
    expect(localDateKey(instant, 'Asia/Tokyo')).toBe('2026-09-07');
  });
});

describe('computeStreak', () => {
  it('is 0 with no activity', () => {
    expect(computeStreak([], '2026-09-06')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(
      computeStreak(['2026-09-06', '2026-09-05', '2026-09-04'], '2026-09-06')
    ).toBe(3);
  });

  it('keeps the streak alive when today has no review yet', () => {
    expect(computeStreak(['2026-09-05', '2026-09-04'], '2026-09-06')).toBe(2);
  });

  it('breaks on a gap', () => {
    expect(
      computeStreak(['2026-09-06', '2026-09-04', '2026-09-03'], '2026-09-06')
    ).toBe(1);
  });

  it('is 0 when the last activity was two days ago', () => {
    expect(computeStreak(['2026-09-04', '2026-09-03'], '2026-09-06')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(
      computeStreak(['2026-09-01', '2026-08-31', '2026-08-30'], '2026-09-01')
    ).toBe(3);
  });

  it('crosses a year boundary', () => {
    expect(
      computeStreak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01')
    ).toBe(3);
  });
});
