import { describe, expect, it } from 'vitest';

import {
  MAX_DAILY_MESSAGE_LIMIT,
  parseDailyMessageLimit,
} from './ai-quota.types';

describe('parseDailyMessageLimit', () => {
  it.each([
    { value: '30', expected: 30 },
    { value: ' 5 ', expected: 5 },
    { value: '0', expected: 0 },
    {
      value: String(MAX_DAILY_MESSAGE_LIMIT),
      expected: MAX_DAILY_MESSAGE_LIMIT,
    },
  ])('reads $value as $expected', ({ value, expected }) => {
    expect(parseDailyMessageLimit(value)).toBe(expected);
  });

  it.each(['', '-1', '1.5', '1e3', 'abc', '10001', '123456'])(
    'refuses %j',
    (value) => {
      expect(parseDailyMessageLimit(value)).toBeNull();
    }
  );
});
