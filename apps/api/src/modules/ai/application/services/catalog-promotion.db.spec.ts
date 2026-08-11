import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  aiCatalogModels,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '../../domain/model-catalog/candidate-filter';
import type { CandidateUpsert } from '../../domain/ports/ai-catalog.repository';
import { CompositeModelCatalog } from '../../infrastructure/catalog/composite-model-catalog';
import { ModelCatalogAdapter } from '../../infrastructure/catalog/model-catalog.adapter';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { DrizzleAiCatalogRepository } from '../../infrastructure/persistence/drizzle-ai-catalog.repository';
import { createMockConfig } from '../../testing/create-mock-config';
import { AiCatalogAdminService } from './ai-catalog-admin.service';
import { SelectableModelsService } from './selectable-models.service';

const ACTOR_ID = '00000000-0000-4000-8000-0000000000cf';
const CHEAP_MODEL_ID = 'openrouter:spec-promo/cheap';
const EXPENSIVE_MODEL_ID = 'openrouter:spec-promo/expensive';
const TEST_MODEL_IDS = [CHEAP_MODEL_ID, EXPENSIVE_MODEL_ID];

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-5';
const NO_BYOK: ReadonlySet<string> = new Set();
const OPENROUTER_BYOK: ReadonlySet<string> = new Set(['openrouter']);
const TIER_GATING_ON = true;
const TIER_GATING_OFF = false;

const BELOW_CEILING_OUTPUT_COST = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN / 2;
const ABOVE_CEILING_OUTPUT_COST = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN * 4;

function candidate(id: string, outputCostPerToken: number): CandidateUpsert {
  return {
    id,
    label: `Label ${id}`,
    description: 'Discovered upstream',
    inputCostPerToken: 0.0000001,
    outputCostPerToken,
    maxInputTokens: 262_144,
    maxOutputTokens: 8_192,
    intelligenceIndex: 55.4,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
  };
}

describe.runIf(DB_AVAILABLE)('promoting a catalog model end to end', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleAiCatalogRepository;
  let promotedCache: PromotedModelsCache;
  let admin: AiCatalogAdminService;
  let selectable: SelectableModelsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    repo = new DrizzleAiCatalogRepository(db);
    await db
      .insert(users)
      .values({
        id: ACTOR_ID,
        email: `e-${ACTOR_ID}@test.local`,
        name: 'Catalog Admin',
        isAnonymous: false,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(aiCatalogModels)
      .where(inArray(aiCatalogModels.id, TEST_MODEL_IDS));
    await moduleRef.close();
  });

  beforeEach(async () => {
    await db
      .delete(aiCatalogModels)
      .where(inArray(aiCatalogModels.id, TEST_MODEL_IDS));
    await repo.upsertCandidate(
      candidate(CHEAP_MODEL_ID, BELOW_CEILING_OUTPUT_COST)
    );
    await repo.upsertCandidate(
      candidate(EXPENSIVE_MODEL_ID, ABOVE_CEILING_OUTPUT_COST)
    );

    promotedCache = new PromotedModelsCache(repo);
    await promotedCache.onModuleInit();
    admin = new AiCatalogAdminService(
      repo,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      promotedCache
    );
    selectable = new SelectableModelsService(
      new CompositeModelCatalog(
        promotedCache,
        new ModelCatalogAdapter(
          createMockConfig({ AI_PRICING_REFRESH_ENABLED: false })
        )
      ),
      { isModelAvailable: () => true } as never,
      promotedCache
    );
  });

  it('leaves a candidate out of the offered catalog until it is promoted', () => {
    expect(
      selectable.isSelectable(CHEAP_MODEL_ID, NO_BYOK, TIER_GATING_ON)
    ).toBe(false);
  });

  it('makes a promoted open-tier model selectable by a user with no key at all', async () => {
    await admin.promote(CHEAP_MODEL_ID, 'open', ACTOR_ID);

    const offered = selectable
      .list(SYSTEM_DEFAULT, NO_BYOK, TIER_GATING_ON)
      .find((m) => m.id === CHEAP_MODEL_ID);

    expect(offered).toMatchObject({
      label: `Label ${CHEAP_MODEL_ID}`,
      tier: 'open',
      access: 'granted',
      billedToUser: false,
      contextWindow: 262_144,
    });
    expect(
      selectable.isSelectable(CHEAP_MODEL_ID, NO_BYOK, TIER_GATING_ON)
    ).toBe(true);
  });

  it('reaches the picker without waiting for the cache interval', async () => {
    const beforePromotion = promotedCache.snapshot().map((m) => m.id);

    await admin.promote(CHEAP_MODEL_ID, 'open', ACTOR_ID);

    expect(beforePromotion).not.toContain(CHEAP_MODEL_ID);
    expect(promotedCache.snapshot().map((m) => m.id)).toContain(CHEAP_MODEL_ID);
  });

  it('routes a promoted model of a paid tier through the caller’s own key', async () => {
    await admin.promote(CHEAP_MODEL_ID, 'powerful', ACTOR_ID);

    expect(
      selectable.isSelectable(CHEAP_MODEL_ID, NO_BYOK, TIER_GATING_ON)
    ).toBe(false);
    expect(selectable.firstOfTier('powerful', OPENROUTER_BYOK)).toBe(
      CHEAP_MODEL_ID
    );
  });

  it('never gives away a promoted model priced above the free ceiling', async () => {
    await admin.promote(EXPENSIVE_MODEL_ID, 'open', ACTOR_ID);

    expect(
      selectable.isSelectable(EXPENSIVE_MODEL_ID, NO_BYOK, TIER_GATING_ON)
    ).toBe(false);
    expect(
      selectable.isSelectable(EXPENSIVE_MODEL_ID, NO_BYOK, TIER_GATING_OFF)
    ).toBe(false);
    expect(
      selectable.isSelectable(
        EXPENSIVE_MODEL_ID,
        OPENROUTER_BYOK,
        TIER_GATING_ON
      )
    ).toBe(true);
  });

  it('withdraws a retired model from the offered catalog', async () => {
    await admin.promote(CHEAP_MODEL_ID, 'open', ACTOR_ID);

    await admin.retire(CHEAP_MODEL_ID, ACTOR_ID);

    expect(
      selectable.isSelectable(CHEAP_MODEL_ID, NO_BYOK, TIER_GATING_ON)
    ).toBe(false);
    expect(promotedCache.snapshot().map((m) => m.id)).not.toContain(
      CHEAP_MODEL_ID
    );
  });

  it('serves edited copy to the picker straight away', async () => {
    await admin.promote(CHEAP_MODEL_ID, 'open', ACTOR_ID);

    await admin.updateCopy(
      CHEAP_MODEL_ID,
      { label: 'Renamed by admin' },
      ACTOR_ID
    );

    expect(
      selectable
        .list(SYSTEM_DEFAULT, NO_BYOK, TIER_GATING_ON)
        .find((m) => m.id === CHEAP_MODEL_ID)?.label
    ).toBe('Renamed by admin');
  });
});
