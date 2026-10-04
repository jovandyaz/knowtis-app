import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { isoDateOf, utcDayOf } from './utc-day';

describe('utcDayOf', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      now: '2026-09-27T12:34:56.789Z',
      key: '2026-09-27',
      start: '2026-09-27T00:00:00.000Z',
      resetsAt: '2026-09-28T00:00:00.000Z',
    },
    {
      now: '2026-09-27T00:00:00.000Z',
      key: '2026-09-27',
      start: '2026-09-27T00:00:00.000Z',
      resetsAt: '2026-09-28T00:00:00.000Z',
    },
    {
      now: '2026-09-27T23:59:59.999Z',
      key: '2026-09-27',
      start: '2026-09-27T00:00:00.000Z',
      resetsAt: '2026-09-28T00:00:00.000Z',
    },
    {
      now: '2026-12-31T23:00:00.000Z',
      key: '2026-12-31',
      start: '2026-12-31T00:00:00.000Z',
      resetsAt: '2027-01-01T00:00:00.000Z',
    },
  ])('buckets $now into $key', ({ now, key, start, resetsAt }) => {
    const day = utcDayOf(new Date(now));

    expect({
      key: day.key,
      start: day.start.toISOString(),
      resetsAt: day.resetsAt.toISOString(),
    }).toEqual({ key, start, resetsAt });
  });
});

describe('isoDateOf', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['2026-09-27T23:59:59.999Z', '2026-09-27'],
    ['2026-10-03T00:00:00.000Z', '2026-10-03'],
  ])('names the UTC day of %s', (date, isoDate) => {
    expect(isoDateOf(new Date(date))).toBe(isoDate);
  });
});
