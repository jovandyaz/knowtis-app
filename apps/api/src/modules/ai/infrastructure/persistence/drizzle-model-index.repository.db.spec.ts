import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray, isNull } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { MAX_INT32, type IndexedModel } from '@knowtis/ai-gateway';

import { validateEnv } from '../../../../config/env.config';
import {
  aiModelIndex,
  DATABASE_CONNECTION,
  DatabaseModule,
  type Database,
} from '../../../../database';
import {
  AI_MODEL_INDEX_COST_CEILING,
  AI_MODEL_INDEX_MAX_LENGTHS,
} from '../../../../database/schema/ai-model-index.schema';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleModelIndexRepository } from './drizzle-model-index.repository';

const FIRST_ID = 'openrouter:spec-index/first';
const SECOND_ID = 'openrouter:spec-index/second';
const THIRD_ID = 'openrouter:spec-index/third';
const OTHER_PROVIDER_ID = 'anthropic:spec-index-claude';
const OVERFLOWING_ID = `openrouter:${'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.id)}`;
const TEST_IDS = [FIRST_ID, SECOND_ID, THIRD_ID, OTHER_PROVIDER_ID];

const FIRST_SEEN_AT = new Date('2000-01-01T00:00:00.000Z');
const SECOND_SEEN_AT = new Date('2000-01-02T00:00:00.000Z');
const THIRD_SEEN_AT = new Date('2000-01-03T00:00:00.000Z');
const AFTER_LAST_SEEN_AT = new Date('2000-01-04T00:00:00.000Z');
const ROLLBACK = new Error('roll back the isolated index');

const SMALL_INPUT_COST = 1.88e-8;
const SMALLEST_OUTPUT_COST = 5e-11;
const REPRICED_INPUT_COST = 2.5e-8;
const LARGEST_COST_BELOW_CEILING =
  AI_MODEL_INDEX_COST_CEILING * (1 - Number.EPSILON);
const NUMERIC_VALUE_OUT_OF_RANGE = '22003';

function allNullOptionals(id: string): IndexedModel {
  return indexed(id, {
    name: 'Second',
    family: null,
    releasedAt: null,
    toolCall: null,
    structuredOutput: null,
    inputCostPerToken: null,
    outputCostPerToken: null,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    reasoning: null,
    openWeights: null,
    retiresAt: null,
  });
}

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

  /** Runs `check` on a repository bound to a transaction that retires every listed row first and is rolled back after, so other specs' and syncs' rows neither count nor change. */
  async function withIsolatedIndex(
    check: (isolated: DrizzleModelIndexRepository) => Promise<void>
  ): Promise<void> {
    await db
      .transaction(async (tx) => {
        await tx
          .update(aiModelIndex)
          .set({ absentSince: FIRST_SEEN_AT })
          .where(isNull(aiModelIndex.absentSince));
        await check(new DrizzleModelIndexRepository(tx as unknown as Database));
        throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) {
          throw error;
        }
      });
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
    const second = allNullOptionals(SECOND_ID);

    const written = await repo.upsertMany([first, second], FIRST_SEEN_AT);

    expect(written).toBe(2);
    const listed = await ownListed();
    expect(listed).toHaveLength(2);
    expect(listed.find((model) => model.id === FIRST_ID)).toEqual(first);
    expect(listed.find((model) => model.id === SECOND_ID)).toEqual(second);
  });

  it('keeps the last row when a batch repeats an id', async () => {
    const written = await repo.upsertMany(
      [
        indexed(FIRST_ID, { name: 'Earlier' }),
        indexed(SECOND_ID),
        indexed(FIRST_ID, { name: 'Later' }),
      ],
      FIRST_SEEN_AT
    );

    expect(written).toBe(2);
    const listed = await ownListed();
    expect(listed).toHaveLength(2);
    expect(listed.find((model) => model.id === FIRST_ID)?.name).toBe('Later');
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

  it('holds the largest token limits and cost the writer lets through', async () => {
    await repo.upsertMany(
      [
        indexed(FIRST_ID, {
          maxInputTokens: MAX_INT32,
          maxOutputTokens: MAX_INT32,
          inputCostPerToken: LARGEST_COST_BELOW_CEILING,
        }),
      ],
      FIRST_SEEN_AT
    );

    const [row] = await ownListed();
    expect(row.maxInputTokens).toBe(MAX_INT32);
    expect(row.maxOutputTokens).toBe(MAX_INT32);
    expect(row.inputCostPerToken).toBe(LARGEST_COST_BELOW_CEILING);
  });

  it.each([
    {
      column: 'max_input_tokens',
      overrides: { maxInputTokens: MAX_INT32 + 1 },
    },
    {
      column: 'input_cost_per_token',
      overrides: { inputCostPerToken: AI_MODEL_INDEX_COST_CEILING },
    },
  ])(
    'rejects a $column one step past what the writer lets through',
    async ({ overrides }) => {
      await expect(
        repo.upsertMany([indexed(FIRST_ID, overrides)], FIRST_SEEN_AT)
      ).rejects.toMatchObject({
        cause: { code: NUMERIC_VALUE_OUT_OF_RANGE },
      });
    }
  );

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

    const marked = await repo.markAbsent('openrouter', SECOND_SEEN_AT, []);

    expect(marked).toEqual([SECOND_ID]);
    expect(await absentSince(SECOND_ID)).toBeInstanceOf(Date);
    expect(await absentSince(FIRST_ID)).toBeNull();
    expect(await absentSince(OTHER_PROVIDER_ID)).toBeNull();
    expect((await ownListed()).map((model) => model.id).sort()).toEqual(
      [FIRST_ID, OTHER_PROVIDER_ID].sort()
    );
    await expect(
      repo.markAbsent('openrouter', SECOND_SEEN_AT, [])
    ).resolves.toEqual([]);
  });

  it('keeps an unseen row listed when its id is in keep, even beside an id no row could hold', async () => {
    await repo.upsertMany(
      [indexed(FIRST_ID), indexed(SECOND_ID), indexed(THIRD_ID)],
      FIRST_SEEN_AT
    );
    await repo.upsertMany([indexed(FIRST_ID)], SECOND_SEEN_AT);

    const marked = await repo.markAbsent('openrouter', SECOND_SEEN_AT, [
      SECOND_ID,
      OVERFLOWING_ID,
    ]);

    expect(marked).toEqual([THIRD_ID]);
    expect(await absentSince(SECOND_ID)).toBeNull();
    expect(await absentSince(THIRD_ID)).toBeInstanceOf(Date);
    expect((await ownListed()).map((model) => model.id).sort()).toEqual(
      [FIRST_ID, SECOND_ID].sort()
    );
  });

  it('clears absent_since when an absent row is seen again', async () => {
    await repo.upsertMany([indexed(FIRST_ID)], FIRST_SEEN_AT);
    await repo.markAbsent('openrouter', SECOND_SEEN_AT, []);
    expect(await absentSince(FIRST_ID)).toBeInstanceOf(Date);

    await repo.upsertMany([indexed(FIRST_ID)], SECOND_SEEN_AT);

    expect(await absentSince(FIRST_ID)).toBeNull();
    expect(await ownListed()).toHaveLength(1);
  });

  it("reads the newest last_seen_at among the provider's listed rows", async () => {
    await withIsolatedIndex(async (isolated) => {
      await isolated.upsertMany([indexed(FIRST_ID)], FIRST_SEEN_AT);
      await isolated.upsertMany([indexed(SECOND_ID)], SECOND_SEEN_AT);
      await isolated.upsertMany(
        [
          indexed(THIRD_ID),
          indexed(OTHER_PROVIDER_ID, {
            provider: 'anthropic',
            source: 'models_dev',
          }),
        ],
        THIRD_SEEN_AT
      );
      await isolated.markAbsent('openrouter', AFTER_LAST_SEEN_AT, [
        FIRST_ID,
        SECOND_ID,
      ]);

      expect(await isolated.lastSeenAt('openrouter')).toEqual(SECOND_SEEN_AT);
    });
  });

  it('reads no last_seen_at while the provider lists no row', async () => {
    await withIsolatedIndex(async (isolated) => {
      await isolated.upsertMany(
        [
          indexed(OTHER_PROVIDER_ID, {
            provider: 'anthropic',
            source: 'models_dev',
          }),
        ],
        THIRD_SEEN_AT
      );

      expect(await isolated.lastSeenAt('openrouter')).toBeNull();
    });
  });
});
