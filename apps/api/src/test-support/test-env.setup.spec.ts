import { expect, it } from 'vitest';

import { resolveTestEnv } from './test-env';

it('applies resolveTestEnv to process.env before any spec module loads', () => {
  const { DATABASE_URL, REDIS_URL, SHARING_PROBE_REDIS_URL } = process.env;

  expect({ DATABASE_URL, REDIS_URL, SHARING_PROBE_REDIS_URL }).toStrictEqual(
    resolveTestEnv(process.env)
  );
});
