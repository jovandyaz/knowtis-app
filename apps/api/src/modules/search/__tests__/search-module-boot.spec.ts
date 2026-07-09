import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AgentModule } from '../../agent/agent.module';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../../agent/domain/retrieval';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchController } from '../search.controller';
import { SearchModule } from '../search.module';

// NestJS records @Module({ exports }) under this Reflect key; reading it proves
// the export contract without booting AgentModule's deep infrastructure graph.
const MODULE_EXPORTS_KEY = 'exports';

const sentinel: NoteHit = {
  id: 'sentinel',
  title: 'Sentinel',
  updatedAt: '2026-07-01T00:00:00.000Z',
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
};

const stubRetrieval: RetrievalPort = {
  search: async () => [sentinel],
  getById: async () => null,
  listRecent: async () => [],
  overview: async () => ({ total: 0, owned: 0, sharedWithMe: 0 }),
};

@Module({
  providers: [{ provide: RETRIEVAL_PORT, useValue: stubRetrieval }],
  exports: [RETRIEVAL_PORT],
})
class StubAgentModule {}

describe('SearchModule bootstrap', () => {
  it('exports RETRIEVAL_PORT from AgentModule for cross-module injection', () => {
    const exports: unknown[] =
      Reflect.getMetadata(MODULE_EXPORTS_KEY, AgentModule) ?? [];
    expect(exports).toContain(RETRIEVAL_PORT);
  });

  it('resolves SearchController with the retrieval port injected via the imported module export', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SearchModule],
    })
      .overrideModule(AgentModule)
      .useModule(StubAgentModule)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = moduleRef.get(SearchController);
    expect(controller).toBeInstanceOf(SearchController);

    const dto = new SearchQueryDto();
    dto.q = 'sentinel';
    const result = await controller.search({ id: 'u1' } as RequestUser, dto);
    expect(result.hits).toEqual([sentinel]);

    await moduleRef.close();
  });
});
