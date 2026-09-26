import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RETRIEVAL_PORT } from '../../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../../agent/domain/retrieval';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { AIErrorCodes } from '../../ai/domain/errors/ai.errors';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchController } from '../search.controller';

const user: RequestUser = {
  id: 'user-1',
  email: 'u@example.com',
  name: 'U',
  avatarUrl: null,
} as RequestUser;

const req = { headers: { 'x-real-ip': '203.0.113.9' } } as unknown as Request;

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

  beforeEach(async () => {
    search.mockReset();
    rateLimit.checkLimit.mockReset().mockResolvedValue({ allowed: true });
    rateLimit.releaseReservation.mockReset().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: RETRIEVAL_PORT, useValue: { search } },
        { provide: AIRateLimitService, useValue: rateLimit },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(SearchController);
  });

  it('should return retrieval hits for the current user', async () => {
    search.mockResolvedValue([hit('a'), hit('b')]);
    const dto = new SearchQueryDto();
    dto.q = 'quarterly report';

    const result = await controller.search(user, dto, req);

    expect(search).toHaveBeenCalledWith('user-1', 'quarterly report');
    expect(result).toEqual({ hits: [hit('a'), hit('b')] });
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

    expect(result).toEqual({ hits: [] });
  });

  it('should reject with 429 before searching when the AI budget is exhausted', async () => {
    rateLimit.checkLimit.mockResolvedValue({ allowed: false });
    const dto = new SearchQueryDto();
    dto.q = 'x';

    await expect(controller.search(user, dto, req)).rejects.toMatchObject({
      status: 429,
      response: {
        statusCode: 429,
        error: AIErrorCodes.RATE_LIMIT_EXCEEDED,
        code: AIErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Daily AI usage limit exceeded. Please try again tomorrow.',
      },
    });
    expect(search).not.toHaveBeenCalled();
    expect(rateLimit.releaseReservation).not.toHaveBeenCalled();
  });

  it('should report the limiter reason in the 429 body', async () => {
    rateLimit.checkLimit.mockResolvedValue({
      allowed: false,
      reason: 'Rate limit exceeded (15 requests/min)',
    });
    const dto = new SearchQueryDto();
    dto.q = 'x';

    await expect(controller.search(user, dto, req)).rejects.toMatchObject({
      status: 429,
      response: {
        code: AIErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded (15 requests/min)',
      },
    });
    expect(rateLimit.releaseReservation).not.toHaveBeenCalled();
  });

  it('should reserve with the caller identity and release the reservation after searching', async () => {
    rateLimit.checkLimit.mockResolvedValue({
      allowed: true,
      reservedIpSubject: 'ip:abc',
    });
    search.mockResolvedValue([hit('a')]);
    const dto = new SearchQueryDto();
    dto.q = 'hello';

    await controller.search({ ...user, isAnonymous: true }, dto, req);

    expect(rateLimit.checkLimit).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      true,
      false,
      0,
      '203.0.113.9'
    );
    const reservedTokens = rateLimit.checkLimit.mock.calls[0]?.[1];
    expect(reservedTokens).toBeGreaterThan(0);
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      'user-1',
      reservedTokens,
      0,
      'ip:abc'
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

    expect(rateLimit.checkLimit).toHaveBeenCalledWith(
      'user-1',
      3,
      false,
      false,
      0,
      '203.0.113.9'
    );
    expect(rateLimit.releaseReservation).toHaveBeenCalledTimes(1);
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      'user-1',
      3,
      0,
      undefined
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
    await expect(response).resolves.toEqual({ hits: [hit('a')] });
  });

  it('should propagate retrieval errors and still release the reservation', async () => {
    search.mockRejectedValue(new Error('boom'));
    const dto = new SearchQueryDto();
    dto.q = 'x';

    await expect(controller.search(user, dto, req)).rejects.toThrow('boom');
    expect(rateLimit.releaseReservation).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      0,
      undefined
    );
  });
});
