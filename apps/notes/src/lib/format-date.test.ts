import { describe, expect, it } from 'vitest';

import { formatDate } from './format-date';

describe('formatDate', () => {
  it('formats a valid ISO timestamp for the given locale', () => {
    // Assert shape rather than an exact day to stay timezone-independent.
    expect(formatDate('2026-07-12T12:00:00.000Z', 'en-US')).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, 2026$/
    );
  });

  it('returns a dash placeholder for an invalid timestamp', () => {
    expect(formatDate('not-a-date', 'en-US')).toBe('—');
  });
});
