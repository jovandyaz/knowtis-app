import { describe, expect, it } from 'vitest';

import { formatDate, formatTime } from './format-date';

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

describe('formatTime', () => {
  it('formats the hour and minutes for the given locale in any time zone', () => {
    expect(formatTime('2026-10-03T00:00:00.000Z', 'en-US')).toMatch(
      /^\d{1,2}:\d{2}\s[AP]M$/
    );
  });

  it('returns a dash placeholder for an invalid timestamp', () => {
    expect(formatTime('not-a-date', 'en-US')).toBe('—');
  });
});
