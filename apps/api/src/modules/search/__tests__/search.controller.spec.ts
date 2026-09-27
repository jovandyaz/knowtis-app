import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RETRIEVAL_PORT } from '../../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../../agent/domain/retrieval';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { TierResolver } from '../../ai/application/services/tier-resolver.service';
import type { AiCaller } from '../../ai/domain/execution-context/ai-execution-context';
import { EMBEDDING_PORT } from '../../ai/domain/ports/embedding.port';
import { createExecutionContext } from '../../ai/testing/create-execution-context';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchController } from '../search.controller';

const user: RequestUser = {
  id: 'user-1',
  email: 'u@example.com',
  name: 'U',
  avatarUrl: null,
} as RequestUser;

const req = { headers: { 'x-real-ip': '203.0.113.9' } } as unknown as Request;

const RESERVATION = { estimate: { tokens: 3, costUsd: 0 } };

function hit(id: string): NoteHit {
  return {
    id,
    title: `Note ${id}`,
    updatedAt: '2026-07-01T00:00:00.000Z',
    isOwner: true,
    isSharedWithMe: false,
    isPubliclyShared: false,
  };
}

describe('SearchController', () => {
  let controller: SearchController;
  const search = vi.fn();
  const rateLimit = {
    checkLimit: vi.fn(),
    releaseReservation: vi.fn(),
  };
  const tierResolver = { resolve: vi.fn() };
  const embedding = { isConfigured: vi.fn() };

  beforeEach(async () => {
    search.mockReset();
    rateLimit.checkLimit
      .mockReset()
      .mockResolvedValue({ allowed: true, reservation: RESERVATION });
    rateLimit.releaseReservation.mockReset().mockResolvedValue(undefined);
    embedding.isConfigured.mockReset().mockReturnValue(true);
    tierResolver.resolve
      .mockReset()
      .mockImplementation(async (caller: AiCaller) =>
        createExecutionContext({
          userId: caller.userId,
          tier: caller.isAnonymous ? 'anonymous' : 'free',
          ...(caller.clientIp ? { clientIp: caller.clientIp } : {}),
        })
      );
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: RETRIEVAL_PORT, useValue: { search } },
        { provide: AIRateLimitService, useValue: rateLimit },
        { provide: TierResolver, useValue: tierResolver },
        { provide: EMBEDDING_PORT, useValue: embedding },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(SearchController);
  });

  it('should return retrieval hits in hybrid mode for the current user', async () => {
    search.mockResolvedValue([hit('a'), hit('b')]);
    const dto = new SearchQueryDto();
    dto.q = 'quarterly report';

    const result = await controller.search(user, dto, req);

    const [execution] = rateLimit.checkLimit.mock.calls[0];
    expect(execution).toMatchObject({
      subject: { userId: 'user-1', clientIp: '203.0.113.9' },
    });
    expect(search).toHaveBeenCalledWith(execution, 'quarterly report', {
      semantic: true,
    });
    expect(result).toEqual({
      hits: [hit('a'), hit('b')],
      mode: 'hybrid',
    });
  });

  it('should cap results at the requested limit', async () => {
    search.mockResolvedValue([hit('a'), hit('b'), hit('c')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';
    dto.limit = 2;

    const result = await controller.search(user, dto, req);

    expect(result.hits).toHaveLength(2);
    expect(result.hits.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('should default to 20 hits when no limit is provided', async () => {
    search.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => hit(String(i)))
    );
    const dto = new SearchQueryDto();
    dto.q = 'x';

    const result = await controller.search(user, dto, req);

    expect(result.hits).toHaveLength(20);
  });

  it('should return a single hit when the limit is 1', async () => {
    search.mockResolvedValue([hit('a'), hit('b')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';
    dto.limit = 1;

    const result = await controller.search(user, dto, req);

    expect(result.hits).toEqual([hit('a')]);
  });

  it('should return an empty hits array when retrieval finds nothing', async () => {
    search.mockResolvedValue([]);
    const dto = new SearchQueryDto();
    dto.q = 'nope';

    const result = await controller.search(user, dto, req);

    expect(result).toEqual({ hits: [], mode: 'hybrid' });
  });

  it('returns lexical results with mode lexical when the AI budget refuses the embed leg', async () => {
    embedding.isConfigured.mockReturnValue(true);
    rateLimit.checkLimit.mockResolvedValue({
      allowed: false,
      reason: 'Too many requests.',
    });
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';

    const result = await controller.search(user, dto, req);

    const [execution] = rateLimit.checkLimit.mock.calls[0];
    expect(result).toEqual({ hits: [hit('a')], mode: 'lexical' });
    expect(search).toHaveBeenCalledWith(execution, 'x', { semantic: false });
    expect(rateLimit.releaseReservation).not.toHaveBeenCalled();
  });

  it('reserves nothing when no embedding provider is configured', async () => {
    embedding.isConfigured.mockReturnValue(false);
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';

    await controller.search(user, dto, req);

    const [execution] = tierResolver.resolve.mock.results.map(
      (r) => r.value
    ) as [Promise<unknown>];
    expect(rateLimit.checkLimit).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith(await execution, 'x', {
      semantic: false,
    });
  });

  it('runs hybrid and releases the reservation when the budget allows it', async () => {
    embedding.isConfigured.mockReturnValue(true);
    const reservation = { estimate: { tokens: 1, costUsd: 0 } };
    rateLimit.checkLimit.mockResolvedValue({ allowed: true, reservation });
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';

    const result = await controller.search(user, dto, req);

    const [execution] = rateLimit.checkLimit.mock.calls[0];
    expect(result).toMatchObject({ mode: 'hybrid' });
    expect(search).toHaveBeenCalledWith(execution, 'x', { semantic: true });
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      execution,
      reservation
    );
  });

  it('should reserve with the caller identity and release the reservation after searching', async () => {
    const reservation = {
      estimate: { tokens: 2, costUsd: 0 },
      reservedIpSubject: 'ip:abc',
    };
    rateLimit.checkLimit.mockResolvedValue({ allowed: true, reservation });
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'hello';

    await controller.search({ ...user, isAnonymous: true }, dto, req);

    expect(tierResolver.resolve).toHaveBeenCalledWith({
      userId: 'user-1',
      isAnonymous: true,
      clientIp: '203.0.113.9',
    });
    const execution = await tierResolver.resolve.mock.results[0]?.value;
    expect(execution.tier).toBe('anonymous');
    expect(rateLimit.checkLimit).toHaveBeenCalledWith(execution, {
      tokens: expect.any(Number),
      costUsd: 0,
    });
    const reservedTokens = rateLimit.checkLimit.mock.calls[0]?.[1].tokens;
    expect(reservedTokens).toBeGreaterThan(0);
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      execution,
      reservation
    );
    expect(rateLimit.releaseReservation).toHaveBeenCalledTimes(1);
    expect(
      rateLimit.releaseReservation.mock.invocationCallOrder[0]
    ).toBeGreaterThan(search.mock.invocationCallOrder[0] ?? Infinity);
  });

  it('should reserve against the registered user budget and release it once', async () => {
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'quarterly report';

    await controller.search(user, dto, req);

    const execution = await tierResolver.resolve.mock.results[0]?.value;
    expect(execution.tier).toBe('free');
    expect(rateLimit.checkLimit).toHaveBeenCalledWith(execution, {
      tokens: 3,
      costUsd: 0,
    });
    expect(rateLimit.releaseReservation).toHaveBeenCalledTimes(1);
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      execution,
      RESERVATION
    );
  });

  it('should not respond until the reservation is released', async () => {
    const release = Promise.withResolvers<undefined>();
    rateLimit.releaseReservation.mockReturnValue(release.promise);
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';
    let settled = false;

    const response = controller.search(user, dto, req).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(rateLimit.releaseReservation).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    release.resolve(undefined);
    await expect(response).resolves.toEqual({
      hits: [hit('a')],
      mode: 'hybrid',
    });
  });

  it('should propagate retrieval errors and still release the reservation', async () => {
    search.mockRejectedValue(new Error('boom'));
    const dto = new SearchQueryDto();
    dto.q = 'x';

    await expect(controller.search(user, dto, req)).rejects.toThrow('boom');
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { userId: 'user-1', clientIp: '203.0.113.9' },
      }),
      RESERVATION
    );
  });

  it('should propagate retrieval errors without releasing when nothing was reserved', async () => {
    embedding.isConfigured.mockReturnValue(false);
    search.mockRejectedValue(new Error('boom'));
    const dto = new SearchQueryDto();
    dto.q = 'x';

    await expect(controller.search(user, dto, req)).rejects.toThrow('boom');
    expect(rateLimit.releaseReservation).not.toHaveBeenCalled();
  });
});
