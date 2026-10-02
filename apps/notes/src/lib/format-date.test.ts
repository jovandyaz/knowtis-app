import { describe, expect, it } from 'vitest';

import { clockTimeOf, formatDate } from './format-date';

describe('formatDate', () => {
  it('formats a valid ISO timestamp for the given locale in any time zone', () => {
    expect(formatDate('2026-07-12T12:00:00.000Z', 'en-US')).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, 2026$/
    );
  });

  it('returns a dash placeholder for an invalid timestamp', () => {
    expect(formatDate('not-a-date', 'en-US')).toBe('—');
  });
});

describe('clockTimeOf', () => {
  it('formats the hour and minutes for the given locale in any time zone', () => {
    expect(clockTimeOf('2026-10-03T00:00:00.000Z', 'en-US').time).toMatch(
      /^\d{1,2}:\d{2}\s[AP]M$/
    );
  });

  it('marks an hour that reads one with the atOne context', () => {
    expect([
      clockTimeOf(new Date(2026, 9, 3, 1, 0).toISOString(), 'es'),
      clockTimeOf(new Date(2026, 9, 3, 13, 0).toISOString(), 'es'),
      clockTimeOf(new Date(2026, 9, 3, 13, 0).toISOString(), 'en-US').context,
    ]).toEqual([
      { time: '1:00', context: 'atOne' },
      { time: '13:00' },
      'atOne',
    ]);
  });

  it('returns a dash placeholder for an invalid timestamp', () => {
    expect(clockTimeOf('not-a-date', 'en-US')).toEqual({ time: '—' });
  });
});
