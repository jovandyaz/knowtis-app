import { describe, expect, it } from 'vitest';

import { resolveTestEnv } from './test-env';

const DEV = 'postgresql://knowtis:pw@localhost:5432/knowtis';
const TEST = 'postgresql://knowtis:pw@localhost:5432/knowtis_test';

describe('resolveTestEnv', () => {
  it('routes specs to DATABASE_URL_TEST', () => {
    expect(
      resolveTestEnv({ DATABASE_URL: DEV, DATABASE_URL_TEST: TEST })
        .DATABASE_URL
    ).toBe(TEST);
  });

  it('blanks DATABASE_URL when no test URL is set, so the dev database is unreachable', () => {
    expect(resolveTestEnv({ DATABASE_URL: DEV }).DATABASE_URL).toBe('');
  });

  it.each([
    DEV,
    `${DEV}?sslmode=disable`,
    'postgresql://u:p@h:5432/knowtis_test_copy',
  ])(
    'refuses a test URL whose database name does not end in _test: %s',
    (url) =>
      expect(() => resolveTestEnv({ DATABASE_URL_TEST: url })).toThrow(/_test/)
  );

  it('accepts a query string on a _test database', () => {
    expect(
      resolveTestEnv({ DATABASE_URL_TEST: `${TEST}?sslmode=disable` })
        .DATABASE_URL
    ).toBe(`${TEST}?sslmode=disable`);
  });

  it('maps REDIS_URL_TEST onto REDIS_URL and SHARING_PROBE_REDIS_URL', () => {
    const env = resolveTestEnv({
      REDIS_URL: 'redis://localhost:6379',
      REDIS_URL_TEST: 'redis://localhost:6379/15',
    });
    expect([env.REDIS_URL, env.SHARING_PROBE_REDIS_URL]).toEqual([
      'redis://localhost:6379/15',
      'redis://localhost:6379/15',
    ]);
  });

  it('blanks both Redis URLs when REDIS_URL_TEST is unset', () => {
    const env = resolveTestEnv({ REDIS_URL: 'redis://localhost:6379' });
    expect([env.REDIS_URL, env.SHARING_PROBE_REDIS_URL]).toEqual(['', '']);
  });

  it('fails in CI without DATABASE_URL_TEST', () => {
    expect(() =>
      resolveTestEnv({ CI: 'true', REDIS_URL_TEST: 'redis://x:6379/15' })
    ).toThrow('DATABASE_URL_TEST is unset in CI');
  });

  it('fails in CI without REDIS_URL_TEST', () => {
    expect(() =>
      resolveTestEnv({ CI: 'true', DATABASE_URL_TEST: TEST })
    ).toThrow('REDIS_URL_TEST is unset in CI');
  });

  it('treats whitespace-only values as unset', () => {
    expect(resolveTestEnv({ DATABASE_URL_TEST: '  ' }).DATABASE_URL).toBe('');
  });
});
