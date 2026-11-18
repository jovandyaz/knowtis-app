type Env = Readonly<Record<string, string | undefined>>;

const TEST_DATABASE_NAME = /_test$/;

const read = (env: Env, key: string): string => env[key]?.trim() ?? '';

function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!TEST_DATABASE_NAME.test(name)) {
    throw new Error(
      `DATABASE_URL_TEST names database "${name}": specs only run against a database whose name ends in _test.`
    );
  }
}

function assertSetInCi(value: string, key: string, kind: string): void {
  if (!value) {
    throw new Error(
      `${key} is unset in CI: ${kind} specs would skip and report green with zero coverage.`
    );
  }
}

export function resolveTestEnv(env: Env): {
  DATABASE_URL: string;
  REDIS_URL: string;
  SHARING_PROBE_REDIS_URL: string;
} {
  const databaseUrl = read(env, 'DATABASE_URL_TEST');
  const redisUrl = read(env, 'REDIS_URL_TEST');

  if (databaseUrl) {
    assertTestDatabase(databaseUrl);
  }
  if (env['CI']) {
    assertSetInCi(databaseUrl, 'DATABASE_URL_TEST', 'database-backed');
    assertSetInCi(redisUrl, 'REDIS_URL_TEST', 'redis-backed');
  }

  return {
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    SHARING_PROBE_REDIS_URL: redisUrl,
  };
}
