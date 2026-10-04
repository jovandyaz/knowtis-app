import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
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
import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import type { CandidateUpsert } from '../../domain/ports/ai-catalog.repository';
import { CompositeModelCatalog } from '../../infrastructure/catalog/composite-model-catalog';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { DrizzleAiCatalogRepository } from '../../infrastructure/persistence/drizzle-ai-catalog.repository';
import { createExecutionContext } from '../../testing/create-execution-context';
import { createResolutionsStub } from '../../testing/platform-resolutions';
import { createSnapshotIndex } from '../../testing/snapshot-index';
import { AiCatalogAdminService } from './ai-catalog-admin.service';
import { SelectableModelsService } from './selectable-models.service';

const ACTOR_ID = '00000000-0000-4000-8000-0000000000cf';
const PROMO_MODEL_ID = 'openrouter:spec-promo/model';

const PLATFORM_INTENTS = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
} as const;
const FREE_CALLER = createExecutionContext({ tier: 'free' });
const OPENROUTER_KEY = createExecutionContext({
  tier: 'byok',
  byokProviders: ['openrouter'],
});

const OUTPUT_COST_PER_TOKEN = 0.000002;

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
    reasoning: null,
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

  function listedTo(execution: AiExecutionContext) {
    return selectable.toSelectable(
      selectable.catalogFor(execution, PLATFORM_INTENTS, null)
    );
  }

  function listedIds(execution: AiExecutionContext) {
    return listedTo(execution).map((model) => model.id);
  }

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
      .where(inArray(aiCatalogModels.id, [PROMO_MODEL_ID]));
    await db.delete(users).where(eq(users.id, ACTOR_ID));
    await moduleRef.close();
  });

  beforeEach(async () => {
    await db
      .delete(aiCatalogModels)
      .where(inArray(aiCatalogModels.id, [PROMO_MODEL_ID]));
    await repo.upsertCandidate(
      candidate(PROMO_MODEL_ID, OUTPUT_COST_PER_TOKEN)
    );

    promotedCache = new PromotedModelsCache(repo);
    await promotedCache.onModuleInit();
    admin = new AiCatalogAdminService(
      repo,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      promotedCache,
      { run: vi.fn() } as never,
      createResolutionsStub()
    );
    const index = createSnapshotIndex();
    selectable = new SelectableModelsService(
      new CompositeModelCatalog(promotedCache, index),
      { isModelAvailable: () => true } as never,
      promotedCache,
      index,
      createResolutionsStub()
    );
  });

  it('leaves a candidate out of the catalog until it is promoted', () => {
    expect(listedIds(OPENROUTER_KEY)).not.toContain(PROMO_MODEL_ID);
  });

  it('lists a promoted open-tier model to an OpenRouter key holder, billed to their key', async () => {
    await admin.promote(PROMO_MODEL_ID, 'open', ACTOR_ID);

    const offered = listedTo(OPENROUTER_KEY).find(
      (m) => m.id === PROMO_MODEL_ID
    );

    expect(offered).toMatchObject({
      label: `Label ${PROMO_MODEL_ID}`,
      tier: 'open',
      billedToUser: true,
      contextWindow: 262_144,
    });
    expect(listedIds(FREE_CALLER)).not.toContain(PROMO_MODEL_ID);
  });

  it('lists a promoted model whatever its tier to the key holder only', async () => {
    await admin.promote(PROMO_MODEL_ID, 'powerful', ACTOR_ID);

    expect(listedIds(OPENROUTER_KEY)).toContain(PROMO_MODEL_ID);
    expect(listedIds(FREE_CALLER)).not.toContain(PROMO_MODEL_ID);
  });

  it('reaches the picker without waiting for the cache interval', async () => {
    const beforePromotion = promotedCache.snapshot().map((m) => m.id);

    await admin.promote(PROMO_MODEL_ID, 'open', ACTOR_ID);

    expect(beforePromotion).not.toContain(PROMO_MODEL_ID);
    expect(promotedCache.snapshot().map((m) => m.id)).toContain(PROMO_MODEL_ID);
  });

  it('withdraws a retired model from the catalog', async () => {
    await admin.promote(PROMO_MODEL_ID, 'open', ACTOR_ID);

    await admin.retire(PROMO_MODEL_ID, ACTOR_ID);

    expect(listedIds(OPENROUTER_KEY)).not.toContain(PROMO_MODEL_ID);
    expect(promotedCache.snapshot().map((m) => m.id)).not.toContain(
      PROMO_MODEL_ID
    );
  });

  it('returns a retired model to the candidates queue', async () => {
    const promoted = await admin.promote(PROMO_MODEL_ID, 'powerful', ACTOR_ID);
    expect(promoted?.status).toBe('promoted');

    const retired = await admin.retire(PROMO_MODEL_ID, ACTOR_ID);
    expect(retired?.status).toBe('candidate');

    const { items } = await admin.listCandidates({
      page: 1,
      limit: 25,
      search: PROMO_MODEL_ID,
    });
    expect(items.map((model) => model.id)).toContain(PROMO_MODEL_ID);
    expect(items.find((model) => model.id === PROMO_MODEL_ID)).toMatchObject({
      status: 'candidate',
      tier: 'open',
      promotedAt: null,
    });
  });

  it('stores candidate reasoning and lets the next sync clear it', async () => {
    await repo.upsertCandidate({
      ...candidate(PROMO_MODEL_ID, OUTPUT_COST_PER_TOKEN),
      reasoning: { levels: ['low', 'high'], mandatory: true },
    });

    const { items } = await repo.listCandidates({
      page: 1,
      limit: 25,
      search: PROMO_MODEL_ID,
    });
    expect(
      items.find((model) => model.id === PROMO_MODEL_ID)?.reasoning
    ).toEqual({ levels: ['low', 'high'], mandatory: true });

    await repo.upsertCandidate({
      ...candidate(PROMO_MODEL_ID, OUTPUT_COST_PER_TOKEN),
      reasoning: null,
    });

    const after = await repo.listCandidates({
      page: 1,
      limit: 25,
      search: PROMO_MODEL_ID,
    });
    expect(
      after.items.find((model) => model.id === PROMO_MODEL_ID)?.reasoning
    ).toBeNull();
  });

  it('serves edited copy to the picker straight away', async () => {
    await admin.promote(PROMO_MODEL_ID, 'open', ACTOR_ID);

    await admin.updateCopy(
      PROMO_MODEL_ID,
      { label: 'Renamed by admin' },
      ACTOR_ID
    );

    expect(
      listedTo(OPENROUTER_KEY).find((m) => m.id === PROMO_MODEL_ID)?.label
    ).toBe('Renamed by admin');
  });
});
