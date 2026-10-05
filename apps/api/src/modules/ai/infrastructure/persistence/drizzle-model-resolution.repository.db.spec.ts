import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, notInArray } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { PLATFORM_SELECTOR_KEYS } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  aiModelResolutions,
  DATABASE_CONNECTION,
  DatabaseModule,
  type AiModelResolutionRow,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { PLATFORM_SEED_MODELS } from '../../domain/model-catalog/platform-resolution';
import { DrizzleModelResolutionRepository } from './drizzle-model-resolution.repository';

const AT = new Date('2026-10-04T12:00:00.000Z');
const LATER_AT = new Date('2026-10-04T13:00:00.000Z');
const PREVIOUS = 'openrouter:z-ai/glm-5.1';
const CHANGED_AT = new Date('2026-09-01T00:00:00.000Z');
const RELEASED_AT = new Date('2026-09-15T00:00:00.000Z');
const CHECK_VIOLATION = '23514';
const OLD_PENDING = 'openrouter:z-ai/glm-5.2';
const NEW_PENDING = 'openrouter:deepseek/deepseek-v4.1-flash';
const RELEASED = 'openrouter:qwen/qwen3.8-max-0902';
const RUN_URL = 'https://github.com/jovandyaz/knowtis-app/actions/runs/1';
const VERDICT_DETAIL = 'leaked a secret';
const NOTHING_PENDING = { pendingModelId: null, gateStatus: null };

describe.runIf(DB_AVAILABLE)('DrizzleModelResolutionRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleModelResolutionRepository;
  let snapshot: AiModelResolutionRow[];

  async function rowOf(selectorKey: AiModelResolutionRow['selectorKey']) {
    const [row] = await db
      .select()
      .from(aiModelResolutions)
      .where(eq(aiModelResolutions.selectorKey, selectorKey));
    return row;
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
    repo = new DrizzleModelResolutionRepository(db);
  });

  beforeEach(async () => {
    snapshot = await db.select().from(aiModelResolutions);
  });

  afterEach(async () => {
    await db
      .delete(aiModelResolutions)
      .where(
        notInArray(aiModelResolutions.selectorKey, [...PLATFORM_SELECTOR_KEYS])
      );
    for (const row of snapshot) {
      await db
        .update(aiModelResolutions)
        .set(row)
        .where(eq(aiModelResolutions.selectorKey, row.selectorKey));
    }
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('lists the seeded active model of every platform intent', async () => {
    const rows = await repo.list();
    expect(
      Object.fromEntries(
        rows.map((row) => [row.selectorKey, row.activeModelId])
      )
    ).toEqual({
      'platform.fast': PLATFORM_SEED_MODELS.fast,
      'platform.balanced': PLATFORM_SEED_MODELS.balanced,
      'platform.powerful': PLATFORM_SEED_MODELS.powerful,
    });
  });

  it('maps every column of a row to the resolution', async () => {
    await db
      .update(aiModelResolutions)
      .set({
        previousModelId: PREVIOUS,
        changedAt: CHANGED_AT,
        releasedModelId: RELEASED,
        releasedAt: RELEASED_AT,
        pendingModelId: NEW_PENDING,
        gateStatus: 'failed',
        gateDetail: VERDICT_DETAIL,
        gateRunUrl: RUN_URL,
      })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));

    const fast = (await repo.list()).find(
      (row) => row.selectorKey === 'platform.fast'
    );

    expect(fast).toEqual({
      selectorKey: 'platform.fast',
      activeModelId: PLATFORM_SEED_MODELS.fast,
      previousModelId: PREVIOUS,
      changedAt: CHANGED_AT,
      releasedModelId: RELEASED,
      releasedAt: RELEASED_AT,
      pendingModelId: NEW_PENDING,
      gateStatus: 'failed',
      gateDetail: VERDICT_DETAIL,
      gateRunUrl: RUN_URL,
    });
  });

  it('marks a model pending and clears the last gate detail', async () => {
    await db
      .update(aiModelResolutions)
      .set({
        pendingModelId: OLD_PENDING,
        gateStatus: 'failed',
        gateDetail: VERDICT_DETAIL,
        gateRunUrl: RUN_URL,
      })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));

    const pended = await repo.setPending(
      'platform.fast',
      NEW_PENDING,
      { pendingModelId: OLD_PENDING, gateStatus: 'failed' },
      AT
    );

    expect(pended).toBe(true);
    expect(await rowOf('platform.fast')).toMatchObject({
      pendingModelId: NEW_PENDING,
      gateStatus: 'pending',
      gateDetail: null,
      gateRunUrl: null,
      updatedAt: AT,
    });
  });

  it('clears a pending model with its gate status and detail', async () => {
    await repo.setPending(
      'platform.balanced',
      NEW_PENDING,
      NOTHING_PENDING,
      AT
    );

    const cleared = await repo.clearPending(
      'platform.balanced',
      NEW_PENDING,
      LATER_AT
    );

    expect(cleared).toBe(true);
    expect(await rowOf('platform.balanced')).toMatchObject({
      pendingModelId: null,
      gateStatus: null,
      gateDetail: null,
      gateRunUrl: null,
      updatedAt: LATER_AT,
    });
  });

  it('leaves a model that is no longer the pending one', async () => {
    await repo.setPending(
      'platform.balanced',
      NEW_PENDING,
      NOTHING_PENDING,
      AT
    );

    const cleared = await repo.clearPending(
      'platform.balanced',
      OLD_PENDING,
      LATER_AT
    );

    expect(cleared).toBe(false);
    expect(await rowOf('platform.balanced')).toMatchObject({
      pendingModelId: NEW_PENDING,
      gateStatus: 'pending',
      updatedAt: AT,
    });
  });

  it('never clears a failed verdict', async () => {
    await db
      .update(aiModelResolutions)
      .set({
        pendingModelId: NEW_PENDING,
        gateStatus: 'failed',
        gateDetail: VERDICT_DETAIL,
        gateRunUrl: RUN_URL,
        updatedAt: AT,
      })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));

    const cleared = await repo.clearPending(
      'platform.fast',
      NEW_PENDING,
      LATER_AT
    );

    expect(cleared).toBe(false);
    expect(await rowOf('platform.fast')).toMatchObject({
      pendingModelId: NEW_PENDING,
      gateStatus: 'failed',
      gateDetail: VERDICT_DETAIL,
      gateRunUrl: RUN_URL,
      updatedAt: AT,
    });
  });

  it('keeps a verdict that landed after the pending entry was read', async () => {
    await repo.setPending('platform.fast', OLD_PENDING, NOTHING_PENDING, AT);
    await db
      .update(aiModelResolutions)
      .set({ gateStatus: 'failed', gateDetail: VERDICT_DETAIL })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));

    const pended = await repo.setPending(
      'platform.fast',
      NEW_PENDING,
      { pendingModelId: OLD_PENDING, gateStatus: 'pending' },
      LATER_AT
    );

    expect(pended).toBe(false);
    expect(await rowOf('platform.fast')).toMatchObject({
      pendingModelId: OLD_PENDING,
      gateStatus: 'failed',
      gateDetail: VERDICT_DETAIL,
      updatedAt: AT,
    });
  });

  it('activates a passed pending model in one write', async () => {
    await repo.setPending('platform.fast', NEW_PENDING, NOTHING_PENDING, AT);
    await db
      .update(aiModelResolutions)
      .set({ gateDetail: VERDICT_DETAIL })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));
    const applied = await repo.recordVerdict(
      'platform.fast',
      NEW_PENDING,
      { passed: true, runUrl: RUN_URL },
      LATER_AT
    );
    expect(applied).toBe(true);
    expect(await rowOf('platform.fast')).toMatchObject({
      activeModelId: NEW_PENDING,
      previousModelId: PLATFORM_SEED_MODELS.fast,
      changedAt: LATER_AT,
      pendingModelId: null,
      gateStatus: null,
      gateDetail: null,
      gateRunUrl: RUN_URL,
      updatedAt: LATER_AT,
    });
  });

  it('keeps a failed pending model with its verdict detail', async () => {
    await repo.setPending('platform.fast', NEW_PENDING, NOTHING_PENDING, AT);
    const applied = await repo.recordVerdict(
      'platform.fast',
      NEW_PENDING,
      { passed: false, runUrl: RUN_URL, detail: VERDICT_DETAIL },
      LATER_AT
    );
    expect(applied).toBe(true);
    expect(await rowOf('platform.fast')).toMatchObject({
      activeModelId: PLATFORM_SEED_MODELS.fast,
      pendingModelId: NEW_PENDING,
      gateStatus: 'failed',
      gateDetail: VERDICT_DETAIL,
      gateRunUrl: RUN_URL,
      updatedAt: LATER_AT,
    });
  });

  it('ignores a verdict for a model that is no longer pending', async () => {
    await repo.setPending('platform.fast', NEW_PENDING, NOTHING_PENDING, AT);
    const applied = await repo.recordVerdict(
      'platform.fast',
      OLD_PENDING,
      { passed: true, runUrl: RUN_URL },
      LATER_AT
    );
    expect(applied).toBe(false);
    expect(await rowOf('platform.fast')).toMatchObject({
      activeModelId: PLATFORM_SEED_MODELS.fast,
      pendingModelId: NEW_PENDING,
      gateStatus: 'pending',
      updatedAt: AT,
    });
  });

  it('ignores a second verdict once the first one failed', async () => {
    await repo.setPending('platform.fast', NEW_PENDING, NOTHING_PENDING, AT);
    await repo.recordVerdict(
      'platform.fast',
      NEW_PENDING,
      { passed: false, runUrl: RUN_URL, detail: VERDICT_DETAIL },
      AT
    );
    expect(
      await repo.recordVerdict(
        'platform.fast',
        NEW_PENDING,
        { passed: true, runUrl: RUN_URL },
        LATER_AT
      )
    ).toBe(false);
    expect(await rowOf('platform.fast')).toMatchObject({
      activeModelId: PLATFORM_SEED_MODELS.fast,
      pendingModelId: NEW_PENDING,
      gateStatus: 'failed',
      gateDetail: VERDICT_DETAIL,
      gateRunUrl: RUN_URL,
      updatedAt: AT,
    });
  });

  it('swaps the active and previous models', async () => {
    await db
      .update(aiModelResolutions)
      .set({
        previousModelId: PREVIOUS,
        changedAt: CHANGED_AT,
        pendingModelId: NEW_PENDING,
        gateStatus: 'failed',
        gateDetail: VERDICT_DETAIL,
        gateRunUrl: RUN_URL,
      })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));

    const rolledBack = await repo.rollback(
      'platform.fast',
      PLATFORM_SEED_MODELS.fast,
      LATER_AT
    );

    expect(rolledBack).toBe(true);
    expect(await rowOf('platform.fast')).toMatchObject({
      activeModelId: PREVIOUS,
      previousModelId: PLATFORM_SEED_MODELS.fast,
      changedAt: LATER_AT,
      pendingModelId: NEW_PENDING,
      gateStatus: 'failed',
      gateDetail: VERDICT_DETAIL,
      gateRunUrl: RUN_URL,
      updatedAt: LATER_AT,
    });
  });

  it('refuses without a previous model', async () => {
    const before = await rowOf('platform.fast');

    const rolledBack = await repo.rollback(
      'platform.fast',
      PLATFORM_SEED_MODELS.fast,
      LATER_AT
    );

    expect(rolledBack).toBe(false);
    expect(await rowOf('platform.fast')).toEqual(before);
  });

  it('refuses when the active model changed meanwhile', async () => {
    await db
      .update(aiModelResolutions)
      .set({ previousModelId: PREVIOUS, changedAt: CHANGED_AT, updatedAt: AT })
      .where(eq(aiModelResolutions.selectorKey, 'platform.fast'));

    const rolledBack = await repo.rollback('platform.fast', RELEASED, LATER_AT);

    expect(rolledBack).toBe(false);
    expect(await rowOf('platform.fast')).toMatchObject({
      activeModelId: PLATFORM_SEED_MODELS.fast,
      previousModelId: PREVIOUS,
      changedAt: CHANGED_AT,
      updatedAt: AT,
    });
  });

  it('records the model a pin change released', async () => {
    await repo.setPending(
      'platform.powerful',
      NEW_PENDING,
      NOTHING_PENDING,
      AT
    );

    await repo.recordRelease('platform.powerful', RELEASED, LATER_AT);

    expect(await rowOf('platform.powerful')).toMatchObject({
      releasedModelId: RELEASED,
      releasedAt: LATER_AT,
      updatedAt: LATER_AT,
    });
  });

  it('refuses a selector key outside the platform intents', async () => {
    await expect(
      db.insert(aiModelResolutions).values({
        selectorKey: 'byok.fast' as never,
        activeModelId: RELEASED,
      })
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: CHECK_VIOLATION }),
    });
  });

  it('refuses a pending model without a gate status', async () => {
    await expect(
      db
        .update(aiModelResolutions)
        .set({ pendingModelId: NEW_PENDING })
        .where(eq(aiModelResolutions.selectorKey, 'platform.fast'))
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: CHECK_VIOLATION }),
    });
  });

  it('refuses a passed gate status', async () => {
    await expect(
      db
        .update(aiModelResolutions)
        .set({ pendingModelId: NEW_PENDING, gateStatus: 'passed' as never })
        .where(eq(aiModelResolutions.selectorKey, 'platform.fast'))
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: CHECK_VIOLATION }),
    });
  });
});
