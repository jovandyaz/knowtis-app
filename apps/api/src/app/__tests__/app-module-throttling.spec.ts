import { MODULE_METADATA } from '@nestjs/common/constants';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ThrottlingModule } from '../../core/throttling/throttling.module';

const BOOT_ENV = {
  DATABASE_URL: 'postgres://api:api@localhost:5432/api',
  JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
  JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
  TOKEN_HASH_KEY: 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=',
} as const;

const APP_MODULE_IMPORT_TIMEOUT_MS = 30_000;

describe('AppModule', () => {
  const priorEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    // ConfigModule.forRoot validates the environment, and auth.module.ts reads
    // its secrets with getOrThrow, both while app.module.ts is still being
    // imported — so these must land ahead of the dynamic import below.
    for (const [key, value] of Object.entries(BOOT_ENV)) {
      priorEnv.set(key, process.env[key]);
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of priorEnv) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  });

  // Wiring only, and deliberately: booting AppModule needs a live database, so
  // the 200-then-429 boundary, the per-user buckets and the default budget are
  // pinned against a real request path in core/throttling/throttling.module.spec.ts.
  // What that spec cannot show is that the real app composes the module at all.
  it(
    'imports ThrottlingModule, whose APP_GUARD is what rate limits every route',
    async () => {
      const { AppModule } = await import('../app.module');

      const imports: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];

      expect(imports).toContain(ThrottlingModule);
    },
    APP_MODULE_IMPORT_TIMEOUT_MS
  );
});
