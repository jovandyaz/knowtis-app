import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../../test-support/module-boot';
import { RETRIEVAL_PORT } from '../../agent/domain/ports/retrieval.port';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { AI_REDIS } from '../../ai/infrastructure/redis/ai-redis.provider';
import { SearchController } from '../search.controller';
import { SearchModule } from '../search.module';

const COMPILE_TIMEOUT_MS = 15_000;

const IMPORTED_TOKENS: readonly unknown[] = [
  RETRIEVAL_PORT,
  AIRateLimitService,
];

const mockAllButTheImportedTokens = (token: unknown) =>
  IMPORTED_TOKENS.includes(token) ? undefined : infrastructureStub();

describe('SearchModule wiring', () => {
  it(
    'builds SearchController on the retrieval port and rate limiter its imported modules export',
    async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [bootConfigModule(), SearchModule],
      })
        .overrideProvider(AI_REDIS)
        .useValue(infrastructureStub())
        .useMocker(mockAllButTheImportedTokens)
        .compile();

      try {
        const controller = moduleRef.get(SearchController);
        const retrieval = moduleRef.get(RETRIEVAL_PORT);
        const rateLimit = moduleRef.get(AIRateLimitService);

        expect(rateLimit).toBeInstanceOf(AIRateLimitService);
        expect(Object.values(controller)).toContain(retrieval);
        expect(Object.values(controller)).toContain(rateLimit);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
