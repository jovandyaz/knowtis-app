type Env = Readonly<Record<string, string | undefined>>;

const TEST_DATABASE_NAME = /_test$/;
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
// postgres.js sends unknown query keys in the startup message, where
// `database` overrides the path's name; libpq reads `dbname` the same way.
const DATABASE_QUERY_KEYS = ['database', 'dbname'];

const read = (env: Env, key: string): string => env[key]?.trim() ?? '';

function assertTestDatabase(raw: string): void {
  const url = new URL(raw);
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error(
      'DATABASE_URL_TEST must be a postgres:// or postgresql:// URL naming a database that ends in _test.'
    );
  }
  const names = [
    url.pathname.slice(1),
    ...DATABASE_QUERY_KEYS.flatMap((key) => url.searchParams.getAll(key)),
  ];
  const wrong = names.find((name) => !TEST_DATABASE_NAME.test(name));
  if (wrong !== undefined) {
    throw new Error(
      `DATABASE_URL_TEST names database "${wrong}": specs only run against a database whose name ends in _test.`
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

  return { DATABASE_URL: databaseUrl, REDIS_URL: redisUrl };
}
