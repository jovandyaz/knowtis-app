import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RETRIEVAL_PORT } from '../../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../../agent/domain/retrieval';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchController } from '../search.controller';

const user: RequestUser = {
  id: 'user-1',
  email: 'u@example.com',
  name: 'U',
  avatarUrl: null,
} as RequestUser;

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

  beforeEach(async () => {
    search.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: RETRIEVAL_PORT, useValue: { search } }],
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

    const result = await controller.search(user, dto);

    expect(search).toHaveBeenCalledWith('user-1', 'quarterly report');
    expect(result).toEqual({ hits: [hit('a'), hit('b')] });
  });

  it('should cap results at the requested limit', async () => {
    search.mockResolvedValue([hit('a'), hit('b'), hit('c')]);
    const dto = new SearchQueryDto();
    dto.q = 'x';
    dto.limit = 2;

    const result = await controller.search(user, dto);

    expect(result.hits).toHaveLength(2);
    expect(result.hits.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('should default to 20 hits when no limit is provided', async () => {
    search.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => hit(String(i)))
    );
    const dto = new SearchQueryDto();
    dto.q = 'x';

    const result = await controller.search(user, dto);

    expect(result.hits).toHaveLength(20);
  });
});
