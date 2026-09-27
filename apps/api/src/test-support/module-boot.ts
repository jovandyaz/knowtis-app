import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { vi } from 'vitest';

import { validateEnv } from '../config/env.config';

// Run through the real schema so every constructor that parses a setting at
// build time gets the shipped default rather than undefined.
const BOOT_ENV = validateEnv({
  DATABASE_URL: 'postgres://localhost:5432/knowtis_test',
  JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
  JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
  TOKEN_HASH_KEY: 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=',
});

export const bootConfigModule = (): Promise<DynamicModule> =>
  ConfigModule.forRoot({
    isGlobal: true,
    ignoreEnvFile: true,
    load: [() => BOOT_ENV],
  });

// Answers any call with undefined, which is all the infrastructure (database,
// Redis, mail) has to do while the graph is constructed. `then` must stay
// absent: Nest awaits each instance, and a callable `then` never settles.
export const infrastructureStub = (): object =>
  new Proxy(
    {},
    {
      get: (_target, property) =>
        property === 'then' || typeof property === 'symbol'
          ? undefined
          : vi.fn(),
    }
  );
