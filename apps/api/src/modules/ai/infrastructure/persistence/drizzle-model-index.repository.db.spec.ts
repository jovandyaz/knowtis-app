import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { IndexedModel } from '@knowtis/ai-gateway';

import { validateEnv } from '../../../../config/env.config';
import {
  aiModelIndex,
  DATABASE_CONNECTION,
  DatabaseModule,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleModelIndexRepository } from './drizzle-model-index.repository';

const FIRST_ID = 'openrouter:spec-index/first';
const SECOND_ID = 'openrouter:spec-index/second';
const OTHER_PROVIDER_ID = 'anthropic:spec-index-claude';
const TEST_IDS = [FIRST_ID, SECOND_ID, OTHER_PROVIDER_ID];

const FIRST_SEEN_AT = new Date('2026-10-01T00:00:00.000Z');
const SECOND_SEEN_AT = new Date('2026-10-02T00:00:00.000Z');

const SMALL_INPUT_COST = 1.88e-8;
const SMALLEST_OUTPUT_COST = 5e-11;
const REPRICED_INPUT_COST = 2.5e-8;

function indexed(
  id: string,
  overrides: Partial<IndexedModel> = {}
): IndexedModel {
  return {
    id,
    provider: 'openrouter',
    name: 'Spec Model',
    family: 'spec',
    releasedAt: '2026-03-01',
    status: 'active',
    toolCall: true,
    structuredOutput: null,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    inputCostPerToken: SMALL_INPUT_COST,
    outputCostPerToken: SMALLEST_OUTPUT_COST,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    maxInputTokens: 128_000,
    maxOutputTokens: 8_192,
    reasoning: { levels: ['low', 'high'], mandatory: false },
    canonical: 'spec-index/model',
    openWeights: false,
    retiresAt: '2027-01-15',
    source: 'openrouter',
    ...overrides,
  };
}

describe.runIf(DB_AVAILABLE)('DrizzleModelIndexRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleModelIndexRepository;

  async function deleteTestRows(): Promise<void> {
    await db.delete(aiModelIndex).where(inArray(aiModelIndex.id, TEST_IDS));
  }

  async function ownListed(): Promise<IndexedModel[]> {
    const listed = await repo.listListed();
    return listed.filter((model) => TEST_IDS.includes(model.id));
  }

  async function absentSince(id: string): Promise<Date | null> {
    const [row] = await db
      .select({ absentSince: aiModelIndex.absentSince })
      .from(aiModelIndex)
      .where(eq(aiModelIndex.id, id));
    expect(row).toBeDefined();
    return row.absentSince;
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
    repo = new DrizzleModelIndexRepository(db);
    await deleteTestRows();
  });

  afterEach(async () => {
    await deleteTestRows();
  });

  afterAll(async () => {
    await deleteTestRows();
    await moduleRef.close();
  });

  it('upserts rows and lists them with every field mapped', async () => {
    const first = indexed(FIRST_ID);
    const second = indexed(SECOND_ID, { name: 'Second', releasedAt: null });

    const written = await repo.upsertMany([first, second], FIRST_SEEN_AT);

    expect(written).toBe(2);
    const listed = await ownListed();
    expect(listed).toHaveLength(2);
    expect(listed.find((model) => model.id === FIRST_ID)).toEqual(first);
    expect(listed.find((model) => model.id === SECOND_ID)).toEqual(second);
  });

  it('returns 0 for an empty batch', async () => {
    await expect(repo.upsertMany([], FIRST_SEEN_AT)).resolves.toBe(0);
  });

  it('updates the price when a row is upserted again', async () => {
    await repo.upsertMany([indexed(FIRST_ID)], FIRST_SEEN_AT);
    await repo.upsertMany(
      [indexed(FIRST_ID, { inputCostPerToken: REPRICED_INPUT_COST })],
      SECOND_SEEN_AT
    );

    const [row] = await ownListed();
    expect(row.inputCostPerToken).toBe(REPRICED_INPUT_COST);
  });

  it('round-trips tiny per-token costs exactly', async () => {
    await repo.upsertMany([indexed(FIRST_ID)], FIRST_SEEN_AT);

    const [row] = await ownListed();
    expect(row.inputCostPerToken).toBe(SMALL_INPUT_COST);
    expect(row.outputCostPerToken).toBe(SMALLEST_OUTPUT_COST);
  });

  it('marks only the unseen row of the given provider absent, once', async () => {
    await repo.upsertMany(
      [
        indexed(FIRST_ID),
        indexed(SECOND_ID),
        indexed(OTHER_PROVIDER_ID, {
          provider: 'anthropic',
          source: 'models_dev',
        }),
      ],
      FIRST_SEEN_AT
    );
    await repo.upsertMany([indexed(FIRST_ID)], SECOND_SEEN_AT);

    const marked = await repo.markAbsent('openrouter', SECOND_SEEN_AT);

    expect(marked).toBe(1);
    expect(await absentSince(SECOND_ID)).toBeInstanceOf(Date);
    expect(await absentSince(FIRST_ID)).toBeNull();
    expect(await absentSince(OTHER_PROVIDER_ID)).toBeNull();
    expect((await ownListed()).map((model) => model.id).sort()).toEqual(
      [FIRST_ID, OTHER_PROVIDER_ID].sort()
    );
    await expect(repo.markAbsent('openrouter', SECOND_SEEN_AT)).resolves.toBe(
      0
    );
  });

  it('clears absent_since when an absent row is seen again', async () => {
    await repo.upsertMany([indexed(FIRST_ID)], FIRST_SEEN_AT);
    await repo.markAbsent('openrouter', SECOND_SEEN_AT);
    expect(await absentSince(FIRST_ID)).toBeInstanceOf(Date);

    await repo.upsertMany([indexed(FIRST_ID)], SECOND_SEEN_AT);

    expect(await absentSince(FIRST_ID)).toBeNull();
    expect(await ownListed()).toHaveLength(1);
  });

  it('counts listed rows per provider, zero for empty providers', async () => {
    const before = await repo.countListedByProvider();
    await repo.upsertMany(
      [
        indexed(FIRST_ID),
        indexed(OTHER_PROVIDER_ID, {
          provider: 'anthropic',
          source: 'models_dev',
        }),
      ],
      FIRST_SEEN_AT
    );

    const after = await repo.countListedByProvider();

    expect(after.openrouter).toBe(before.openrouter + 1);
    expect(after.anthropic).toBe(before.anthropic + 1);
    expect(after.openai).toBe(before.openai);
    expect(after.google).toBe(before.google);
    expect(Object.keys(after).sort()).toEqual([
      'anthropic',
      'google',
      'openai',
      'openrouter',
    ]);
  });
});
