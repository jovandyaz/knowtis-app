import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CATALOG_ALERT_KINDS } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  aiCatalogAlerts,
  aiCatalogModels,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type AiCatalogModelRow,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import type {
  CandidateUpsert,
  CatalogStatusChange,
} from '../../domain/ports/ai-catalog.repository';
import { DrizzleAiCatalogRepository } from './drizzle-ai-catalog.repository';

const ACTOR_ID = '00000000-0000-4000-8000-0000000000ca';
const SECOND_ACTOR_ID = '00000000-0000-4000-8000-0000000000cb';
const PRIMARY_MODEL_ID = 'spec-catalog/primary';
const SECONDARY_MODEL_ID = 'spec-catalog/secondary';
const ABSENT_MODEL_ID = 'spec-catalog/absent';
const TEST_MODEL_IDS = [PRIMARY_MODEL_ID, SECONDARY_MODEL_ID, ABSENT_MODEL_ID];

const SYNCED_LABEL = 'Synced Label';
const SYNCED_DESCRIPTION = 'Synced description';
const UPSTREAM_RENAMED_LABEL = 'Upstream Renamed Label';
const UPSTREAM_RENAMED_DESCRIPTION = 'Upstream renamed description';
const ADMIN_LABEL = 'Curated Label';
const ADMIN_DESCRIPTION = 'Curated description';

const SYNCED_INPUT_COST = 0.0000005;
const SYNCED_OUTPUT_COST = 0.0000015;
const REFRESHED_INPUT_COST = 0.0000009;
const SYNCED_INTELLIGENCE_INDEX = 45.1;
const REFRESHED_INTELLIGENCE_INDEX = 52.6;
const SYNCED_MAX_INPUT_TOKENS = 128_000;
const SYNCED_MAX_OUTPUT_TOKENS = 8_192;
const UPSTREAM_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const STALE_TIMESTAMP = new Date('2020-01-01T00:00:00.000Z');
/** Postgres stamps `now()` from its own clock, which may drift from the test process clock. */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

const FIRST_ALERT_DETAIL = 'upstream marked the model deprecated';
const SECOND_ALERT_DETAIL = 'upstream still reports the model deprecated';
const PRICE_DRIFT_DETAIL = 'input cost rose by 40%';

const PROMOTE_OPEN: CatalogStatusChange = { status: 'promoted', tier: 'open' };
const PROMOTE_FAST: CatalogStatusChange = { status: 'promoted', tier: 'fast' };
const RETIRE: CatalogStatusChange = { status: 'retired' };

function candidate(
  id: string,
  overrides: Partial<CandidateUpsert> = {}
): CandidateUpsert {
  return {
    id,
    label: SYNCED_LABEL,
    description: SYNCED_DESCRIPTION,
    inputCostPerToken: SYNCED_INPUT_COST,
    outputCostPerToken: SYNCED_OUTPUT_COST,
    maxInputTokens: SYNCED_MAX_INPUT_TOKENS,
    maxOutputTokens: SYNCED_MAX_OUTPUT_TOKENS,
    intelligenceIndex: SYNCED_INTELLIGENCE_INDEX,
    upstreamCreatedAt: UPSTREAM_CREATED_AT,
    upstreamExpirationDate: null,
    ...overrides,
  };
}

describe.runIf(DB_AVAILABLE)('DrizzleAiCatalogRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleAiCatalogRepository;

  async function deleteTestRows(): Promise<void> {
    await db
      .delete(aiCatalogAlerts)
      .where(inArray(aiCatalogAlerts.modelId, TEST_MODEL_IDS));
    await db
      .delete(aiCatalogModels)
      .where(inArray(aiCatalogModels.id, TEST_MODEL_IDS));
  }

  async function readModel(id: string): Promise<AiCatalogModelRow> {
    const [row] = await db
      .select()
      .from(aiCatalogModels)
      .where(eq(aiCatalogModels.id, id));
    expect(row).toBeDefined();
    return row;
  }

  async function ownAlerts(unresolvedOnly: boolean) {
    const alerts = await repo.listAlerts(unresolvedOnly);
    return alerts.filter((alert) => TEST_MODEL_IDS.includes(alert.modelId));
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
      .values(
        [ACTOR_ID, SECOND_ACTOR_ID].map((id) => ({
          id,
          email: `e-${id}@test.local`,
          name: 'Catalog Admin',
          isAnonymous: false,
        }))
      )
      .onConflictDoNothing();
    await deleteTestRows();
  });

  afterEach(async () => {
    await deleteTestRows();
  });

  afterAll(async () => {
    await deleteTestRows();
    await db
      .delete(users)
      .where(inArray(users.id, [ACTOR_ID, SECOND_ACTOR_ID]));
    await moduleRef.close();
  });

  it('should insert a newly discovered model as a candidate', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));

    const row = await readModel(PRIMARY_MODEL_ID);
    expect(row).toMatchObject({
      status: 'candidate',
      tier: 'open',
      label: SYNCED_LABEL,
      description: SYNCED_DESCRIPTION,
      inputCostPerToken: SYNCED_INPUT_COST,
      outputCostPerToken: SYNCED_OUTPUT_COST,
      maxInputTokens: SYNCED_MAX_INPUT_TOKENS,
      maxOutputTokens: SYNCED_MAX_OUTPUT_TOKENS,
      intelligenceIndex: SYNCED_INTELLIGENCE_INDEX,
      upstreamExpirationDate: null,
      promotedBy: null,
      promotedAt: null,
    });
    expect(row.upstreamCreatedAt?.toISOString()).toBe(
      UPSTREAM_CREATED_AT.toISOString()
    );

    const candidates = await repo.listByStatus('candidate');
    expect(candidates.map((model) => model.id)).toContain(PRIMARY_MODEL_ID);
  });

  it('should list models ordered by id regardless of insertion order', async () => {
    await repo.upsertCandidate(candidate(SECONDARY_MODEL_ID));
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));

    const ownCandidates = (await repo.listByStatus('candidate'))
      .map((model) => model.id)
      .filter((id) => TEST_MODEL_IDS.includes(id));

    expect(ownCandidates).toEqual([PRIMARY_MODEL_ID, SECONDARY_MODEL_ID]);
  });

  it('should refresh upstream copy while the model is still a candidate', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.upsertCandidate(
      candidate(PRIMARY_MODEL_ID, {
        label: UPSTREAM_RENAMED_LABEL,
        description: UPSTREAM_RENAMED_DESCRIPTION,
      })
    );

    const row = await readModel(PRIMARY_MODEL_ID);
    expect(row.label).toBe(UPSTREAM_RENAMED_LABEL);
    expect(row.description).toBe(UPSTREAM_RENAMED_DESCRIPTION);
  });

  it('should refresh metadata and lastSeenAt on re-upsert without touching status, curated copy or updatedAt', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.setStatus(PRIMARY_MODEL_ID, RETIRE, ACTOR_ID);
    await db
      .update(aiCatalogModels)
      .set({
        lastSeenAt: STALE_TIMESTAMP,
        createdAt: STALE_TIMESTAMP,
        updatedAt: STALE_TIMESTAMP,
      })
      .where(eq(aiCatalogModels.id, PRIMARY_MODEL_ID));

    const beforeUpsert = Date.now();
    await repo.upsertCandidate(
      candidate(PRIMARY_MODEL_ID, {
        label: UPSTREAM_RENAMED_LABEL,
        description: UPSTREAM_RENAMED_DESCRIPTION,
        inputCostPerToken: REFRESHED_INPUT_COST,
        intelligenceIndex: REFRESHED_INTELLIGENCE_INDEX,
        maxOutputTokens: null,
      })
    );
    const afterUpsert = Date.now();

    const row = await readModel(PRIMARY_MODEL_ID);
    expect(row.status).toBe('retired');
    expect(row.label).toBe(SYNCED_LABEL);
    expect(row.description).toBe(SYNCED_DESCRIPTION);
    expect(row.inputCostPerToken).toBe(REFRESHED_INPUT_COST);
    expect(row.intelligenceIndex).toBe(REFRESHED_INTELLIGENCE_INDEX);
    expect(row.maxOutputTokens).toBeNull();
    expect(row.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      beforeUpsert - CLOCK_SKEW_TOLERANCE_MS
    );
    expect(row.lastSeenAt.getTime()).toBeLessThanOrEqual(
      afterUpsert + CLOCK_SKEW_TOLERANCE_MS
    );
    expect(row.updatedAt.getTime()).toBe(STALE_TIMESTAMP.getTime());
  });

  it('should keep admin-edited copy when re-upserting a promoted model', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.setStatus(PRIMARY_MODEL_ID, PROMOTE_OPEN, ACTOR_ID);
    await repo.updateCopy(PRIMARY_MODEL_ID, {
      label: ADMIN_LABEL,
      description: ADMIN_DESCRIPTION,
    });

    await repo.upsertCandidate(
      candidate(PRIMARY_MODEL_ID, {
        label: UPSTREAM_RENAMED_LABEL,
        description: UPSTREAM_RENAMED_DESCRIPTION,
        intelligenceIndex: REFRESHED_INTELLIGENCE_INDEX,
      })
    );

    const row = await readModel(PRIMARY_MODEL_ID);
    expect(row.label).toBe(ADMIN_LABEL);
    expect(row.description).toBe(ADMIN_DESCRIPTION);
    expect(row.status).toBe('promoted');
    expect(row.intelligenceIndex).toBe(REFRESHED_INTELLIGENCE_INDEX);
  });

  it('should stamp promotedBy and promotedAt when promoting', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));

    const promoted = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_OPEN,
      ACTOR_ID
    );

    expect(promoted?.status).toBe('promoted');
    expect(promoted?.promotedBy).toBe(ACTOR_ID);
    expect(promoted?.promotedAt).toBeInstanceOf(Date);

    const promotedIds = (await repo.listByStatus('promoted')).map((m) => m.id);
    expect(promotedIds).toContain(PRIMARY_MODEL_ID);
    const candidateIds = (await repo.listByStatus('candidate')).map(
      (m) => m.id
    );
    expect(candidateIds).not.toContain(PRIMARY_MODEL_ID);
  });

  it('should keep the first promotion actor and timestamp when promoted again', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    const first = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_OPEN,
      ACTOR_ID
    );

    const second = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_OPEN,
      SECOND_ACTOR_ID
    );

    expect(second?.promotedBy).toBe(ACTOR_ID);
    expect(second?.promotedAt?.getTime()).toBe(first?.promotedAt?.getTime());
  });

  it('should stamp a new actor and time when a retired model is promoted again', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    const first = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_OPEN,
      ACTOR_ID
    );
    await repo.setStatus(PRIMARY_MODEL_ID, RETIRE, ACTOR_ID);

    const revived = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_OPEN,
      SECOND_ACTOR_ID
    );

    // Retiring ends a promotion, so reviving one is a new decision by a new
    // admin: the audit fields describe the promotion currently in effect.
    expect(revived?.promotedBy).toBe(SECOND_ACTOR_ID);
    expect(revived?.promotedAt?.getTime()).toBeGreaterThanOrEqual(
      first?.promotedAt?.getTime() ?? 0
    );
  });

  it('should store the tier the promotion chose and let a later one re-tier', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));

    const promoted = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_FAST,
      ACTOR_ID
    );

    expect(promoted?.tier).toBe('fast');
    const reTiered = await repo.setStatus(
      PRIMARY_MODEL_ID,
      PROMOTE_OPEN,
      ACTOR_ID
    );
    expect(reTiered?.tier).toBe('open');
  });

  it('should leave the tier untouched when retiring', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.setStatus(PRIMARY_MODEL_ID, PROMOTE_FAST, ACTOR_ID);

    const retired = await repo.setStatus(PRIMARY_MODEL_ID, RETIRE, ACTOR_ID);

    expect(retired?.status).toBe('retired');
    expect(retired?.tier).toBe('fast');
  });

  it('should return null when the target model does not exist', async () => {
    await expect(
      repo.setStatus(ABSENT_MODEL_ID, PROMOTE_OPEN, ACTOR_ID)
    ).resolves.toBeNull();
    await expect(
      repo.updateCopy(ABSENT_MODEL_ID, { label: ADMIN_LABEL })
    ).resolves.toBeNull();
  });

  it('should patch only the provided copy fields', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));

    const patched = await repo.updateCopy(PRIMARY_MODEL_ID, {
      label: ADMIN_LABEL,
    });

    expect(patched?.label).toBe(ADMIN_LABEL);
    expect(patched?.description).toBe(SYNCED_DESCRIPTION);
  });

  it('should not open a second alert while one is unresolved for the same model and kind', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.upsertCandidate(candidate(SECONDARY_MODEL_ID));

    await repo.createAlert(PRIMARY_MODEL_ID, 'deprecation', FIRST_ALERT_DETAIL);
    await repo.createAlert(
      PRIMARY_MODEL_ID,
      'deprecation',
      SECOND_ALERT_DETAIL
    );

    const open = await ownAlerts(true);
    expect(open).toHaveLength(1);
    expect(open[0].detail).toBe(FIRST_ALERT_DETAIL);

    await repo.createAlert(PRIMARY_MODEL_ID, 'price_drift', PRICE_DRIFT_DETAIL);
    await repo.createAlert(
      SECONDARY_MODEL_ID,
      'deprecation',
      FIRST_ALERT_DETAIL
    );

    const openIds = (await ownAlerts(true)).map((alert) => alert.id);
    expect(openIds).toHaveLength(3);
    expect(openIds).toEqual([...openIds].sort((a, b) => b - a));
  });

  it('should accept every alert kind the domain can raise', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));

    for (const kind of CATALOG_ALERT_KINDS) {
      await repo.createAlert(PRIMARY_MODEL_ID, kind, FIRST_ALERT_DETAIL);
    }

    const open = await ownAlerts(true);
    expect(open.map((alert) => alert.kind).sort()).toEqual(
      [...CATALOG_ALERT_KINDS].sort()
    );
  });

  it('should resolve an alert and allow a new one for the same kind', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.createAlert(PRIMARY_MODEL_ID, 'deprecation', FIRST_ALERT_DETAIL);
    const [opened] = await ownAlerts(true);

    await repo.resolveAlert(opened.id);

    expect(await ownAlerts(true)).toHaveLength(0);
    const all = await ownAlerts(false);
    expect(all).toHaveLength(1);
    expect(all[0].resolvedAt).toBeInstanceOf(Date);

    await repo.createAlert(
      PRIMARY_MODEL_ID,
      'deprecation',
      SECOND_ALERT_DETAIL
    );
    const reopened = await ownAlerts(true);
    expect(reopened).toHaveLength(1);
    expect(reopened[0].detail).toBe(SECOND_ALERT_DETAIL);
  });

  it('should keep the original resolution time when resolving twice', async () => {
    await repo.upsertCandidate(candidate(PRIMARY_MODEL_ID));
    await repo.createAlert(PRIMARY_MODEL_ID, 'deprecation', FIRST_ALERT_DETAIL);
    const [opened] = await ownAlerts(true);

    await repo.resolveAlert(opened.id);
    const firstResolvedAt = (await ownAlerts(false))[0].resolvedAt;
    expect(firstResolvedAt).toBeInstanceOf(Date);

    await repo.resolveAlert(opened.id);

    const [reResolved] = await ownAlerts(false);
    expect(reResolved.resolvedAt?.getTime()).toBe(firstResolvedAt?.getTime());
  });

  describe('listCandidates', () => {
    const SCORED_HIGH = 'openrouter:vendor/paging-high';
    const SCORED_LOW = 'openrouter:vendor/paging-low';
    const UNSCORED = 'openrouter:vendor/paging-unscored';
    const WILDCARD = 'openrouter:vendor/paging-100%-off';
    const WILDCARD_DECOY = 'openrouter:vendor/paging-100-off';
    const PAGING_MODEL_IDS = [
      SCORED_HIGH,
      SCORED_LOW,
      UNSCORED,
      WILDCARD,
      WILDCARD_DECOY,
    ];
    const PAGING_SEARCH = 'paging';
    const PAGE_SIZE = 2;
    const PAGE_COUNT = Math.ceil(PAGING_MODEL_IDS.length / PAGE_SIZE);

    beforeAll(async () => {
      await repo.upsertCandidate(
        candidate(SCORED_HIGH, { label: 'Paging High', intelligenceIndex: 90 })
      );
      await repo.upsertCandidate(
        candidate(SCORED_LOW, { label: 'Paging Low', intelligenceIndex: 10 })
      );
      await repo.upsertCandidate(
        candidate(UNSCORED, {
          label: 'Paging Unscored',
          intelligenceIndex: null,
        })
      );
      await repo.upsertCandidate(
        candidate(WILDCARD, { label: 'Paging Wildcard', intelligenceIndex: 50 })
      );
      await repo.upsertCandidate(
        candidate(WILDCARD_DECOY, {
          label: 'Paging Decoy',
          intelligenceIndex: 30,
        })
      );
    });

    afterAll(async () => {
      await db
        .delete(aiCatalogModels)
        .where(inArray(aiCatalogModels.id, PAGING_MODEL_IDS));
    });

    it('ranks scored models first, unscored last', async () => {
      const { items } = await repo.listCandidates({
        page: 1,
        limit: 100,
        search: PAGING_SEARCH,
      });
      const ours = items.map((m) => m.id);

      expect(ours.indexOf(SCORED_HIGH)).toBeLessThan(ours.indexOf(WILDCARD));
      expect(ours.indexOf(WILDCARD)).toBeLessThan(ours.indexOf(SCORED_LOW));
      expect(ours.at(-1)).toBe(UNSCORED);
    });

    it('reports the full total alongside one page of items', async () => {
      const page = await repo.listCandidates({
        page: 1,
        limit: PAGE_SIZE,
        search: PAGING_SEARCH,
      });

      expect(page.items.map((m) => m.id)).toEqual([SCORED_HIGH, WILDCARD]);
      expect(page.total).toBe(PAGING_MODEL_IDS.length);
    });

    it('never repeats or skips a row across pages', async () => {
      const pages = await Promise.all(
        Array.from({ length: PAGE_COUNT }, (_, index) =>
          repo.listCandidates({
            page: index + 1,
            limit: PAGE_SIZE,
            search: PAGING_SEARCH,
          })
        )
      );
      const ids = pages.flatMap((page) => page.items.map((m) => m.id));

      expect(ids).toHaveLength(PAGING_MODEL_IDS.length);
      expect([...ids].sort()).toEqual([...PAGING_MODEL_IDS].sort());
    });

    it('returns an empty page past the end without lying about the total', async () => {
      const { items, total } = await repo.listCandidates({
        page: 10_000,
        limit: 25,
        search: PAGING_SEARCH,
      });

      expect(items).toEqual([]);
      expect(total).toBe(PAGING_MODEL_IDS.length);
    });

    it('matches a search term against label and id', async () => {
      const byLabel = await repo.listCandidates({
        page: 1,
        limit: 25,
        search: 'Paging Unscored',
      });
      const byId = await repo.listCandidates({
        page: 1,
        limit: 25,
        search: 'paging-low',
      });

      expect(byLabel.items.map((m) => m.id)).toContain(UNSCORED);
      expect(byId.items.map((m) => m.id)).toContain(SCORED_LOW);
    });

    it('treats a wildcard in the search term as a literal', async () => {
      const { items } = await repo.listCandidates({
        page: 1,
        limit: 25,
        search: '100%-off',
      });

      expect(items.map((m) => m.id)).toEqual([WILDCARD]);
    });
  });
});
