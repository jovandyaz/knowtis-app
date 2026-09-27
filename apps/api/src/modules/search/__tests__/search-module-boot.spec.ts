import type { RequestUser } from '@jovandyaz/auth/server';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../../test-support/module-boot';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../agent/domain/ports/retrieval.port';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { TierResolver } from '../../ai/application/services/tier-resolver.service';
import { AI_REDIS } from '../../ai/infrastructure/redis/ai-redis.provider';
import { createExecutionContext } from '../../ai/testing/create-execution-context';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchController } from '../search.controller';
import { SearchModule } from '../search.module';

const COMPILE_TIMEOUT_MS = 15_000;

const IMPORTED_TOKENS: readonly unknown[] = [
  RETRIEVAL_PORT,
  AIRateLimitService,
];

const mockAllButTheImportedTokens = (token: unknown) =>
  IMPORTED_TOKENS.includes(token) ? undefined : infrastructureStub();

const user: RequestUser = {
  id: 'user-1',
  email: 'u@example.com',
  name: 'U',
  avatarUrl: null,
} as RequestUser;

const req = { headers: {} } as unknown as Request;

describe('SearchModule wiring', () => {
  it(
    'exercises an allowed and a rate-limited search through the compiled module',
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
        const retrieval = moduleRef.get<RetrievalPort>(RETRIEVAL_PORT);
        const rateLimit = moduleRef.get(AIRateLimitService);

        expect(rateLimit).toBeInstanceOf(AIRateLimitService);

        const execution = createExecutionContext({ userId: 'user-1' });
        vi.spyOn(moduleRef.get(TierResolver), 'resolve').mockResolvedValue(
          execution
        );
        const checkLimitSpy = vi
          .spyOn(rateLimit, 'checkLimit')
          .mockResolvedValue({
            allowed: true,
            reservation: { estimate: { tokens: 3, costUsd: 0 } },
          });
        const releaseSpy = vi
          .spyOn(rateLimit, 'releaseReservation')
          .mockResolvedValue(undefined);
        const searchSpy = vi.spyOn(retrieval, 'search').mockResolvedValue([
          {
            id: 'note-1',
            title: 'Note',
            updatedAt: '2026-07-01T00:00:00.000Z',
            isOwner: true,
            isSharedWithMe: false,
            isPubliclyShared: false,
          },
        ]);
        const dto = new SearchQueryDto();
        dto.q = 'quarterly report';

        const allowed = await controller.search(user, dto, req);

        expect(allowed.hits).toHaveLength(1);
        expect(searchSpy).toHaveBeenCalledWith(execution, 'quarterly report');
        expect(releaseSpy).toHaveBeenCalledTimes(1);

        checkLimitSpy.mockResolvedValue({ allowed: false });
        searchSpy.mockClear();
        releaseSpy.mockClear();

        await expect(controller.search(user, dto, req)).rejects.toMatchObject({
          status: 429,
        });
        expect(searchSpy).not.toHaveBeenCalled();
        expect(releaseSpy).not.toHaveBeenCalled();
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
