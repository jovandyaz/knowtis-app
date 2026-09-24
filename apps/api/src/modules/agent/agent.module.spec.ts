import 'reflect-metadata';

import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { validateEnv } from '../../config/env.config';
import { AI_REDIS } from '../ai/infrastructure/redis/ai-redis.provider';
import { AgentGateway } from './agent.gateway';
import { AgentModule } from './agent.module';
import { TurnClaimService } from './infrastructure/turn-claim/turn-claim.service';

const COMPILE_TIMEOUT_MS = 15_000;

const BOOT_ENV = validateEnv({
  DATABASE_URL: 'postgres://localhost:5432/knowtis_test',
  JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
  JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
  TOKEN_HASH_KEY: 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=',
});

// Nest awaits every instance it builds, so a callable `then` would never settle.
const infrastructureStub = () =>
  new Proxy(
    {},
    {
      get: (_target, property) =>
        property === 'then' || typeof property === 'symbol'
          ? undefined
          : vi.fn(),
    }
  );

describe('AgentModule wiring', () => {
  it(
    "gives the gateway a turn claim service on the AI module's Redis",
    async () => {
      const redis = infrastructureStub();
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => BOOT_ENV],
          }),
          AgentModule,
        ],
      })
        .overrideProvider(AI_REDIS)
        .useValue(redis)
        .useMocker((token) =>
          token === TurnClaimService ? undefined : infrastructureStub()
        )
        .compile();

      try {
        const claims = moduleRef.get(TurnClaimService);

        expect(claims).toBeInstanceOf(TurnClaimService);
        expect(Object.values(moduleRef.get(AgentGateway))).toContain(claims);
        expect(Object.values(claims)).toContain(redis);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
