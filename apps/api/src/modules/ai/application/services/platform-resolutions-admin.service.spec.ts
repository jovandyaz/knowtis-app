import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';
import type { ModelIntent } from '@knowtis/shared-types';

import { SELECTOR_KEY_BY_INTENT } from '../../domain/model-catalog/platform-resolution';
import { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
import { PLATFORM_FLOOR_ROWS } from '../../testing/create-floor-rows';
import { createIndexedModel } from '../../testing/create-indexed-model';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import {
  createModelResolutionRepositoryStub,
  seededResolution,
} from '../../testing/platform-resolutions';
import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import type { AIConfigEntry, AIConfigService } from './ai-config.service';
import { PlatformResolutionsAdminService } from './platform-resolutions-admin.service';

const PIN = 'openrouter:vendor/pinned';
const SERVED_FAST = 'openrouter:minimax/minimax-m2.5';
const PENDING_ID = 'openrouter:vendor/next';
const RUN_URL = 'https://ci.example/runs/9';
const LAST_SEEN = new Date('2026-10-03T06:00:00.000Z');
const CONFIG_KEY_BY_INTENT = {
  fast: 'ai_fast_model',
  balanced: 'ai_default_model',
  powerful: 'ai_deep_model',
} as const satisfies Record<ModelIntent, string>;

function entry(
  key: string,
  overrides: Partial<AIConfigEntry> = {}
): AIConfigEntry {
  return {
    key,
    value: '',
    kind: 'model',
    source: 'default',
    storedValue: null,
    description: null,
    updatedAt: null,
    ...overrides,
  } as AIConfigEntry;
}

function make(
  opts: {
    entries?: AIConfigEntry[];
    resolutions?: ReturnType<typeof seededResolution>[];
    index?: ModelIndexCache;
  } = {}
) {
  const config = {
    getEffectiveConfig: vi
      .fn<AIConfigService['getEffectiveConfig']>()
      .mockResolvedValue(
        opts.entries ?? [
          entry('ai_fast_model', { value: SERVED_FAST }),
          entry('ai_default_model', { value: 'b' }),
          entry('ai_deep_model', { value: 'p' }),
        ]
      ),
  };
  const resolutions = createModelResolutionRepositoryStub(
    async () =>
      opts.resolutions ?? [
        seededResolution('fast'),
        seededResolution('balanced'),
        seededResolution('powerful'),
      ]
  );
  const indexRepo = createModelIndexRepositoryStub(async () => []);
  vi.mocked(indexRepo.lastSeenAt).mockResolvedValue(LAST_SEEN);
  const service = new PlatformResolutionsAdminService(
    resolutions,
    indexRepo,
    config as unknown as AIConfigService,
    opts.index ?? createSnapshotIndex()
  );
  return { service, indexRepo, config };
}

describe('PlatformResolutionsAdminService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports auto and pinned intents', async () => {
    const { service } = make({
      entries: [
        entry('ai_fast_model', {
          value: PIN,
          source: 'custom',
        }),
        entry('ai_default_model', { value: 'balanced-active' }),
        entry('ai_deep_model', { value: 'powerful-active' }),
      ],
    });

    const { intents, lastSyncAt } = await service.overview();

    expect(intents.map((row) => row.intent)).toEqual([
      'fast',
      'balanced',
      'powerful',
    ]);
    expect(intents[0]).toMatchObject({
      selectorKey: SELECTOR_KEY_BY_INTENT.fast,
      configKey: CONFIG_KEY_BY_INTENT.fast,
      pin: PIN,
      served: PIN,
    });
    expect(intents[1]).toMatchObject({
      configKey: CONFIG_KEY_BY_INTENT.balanced,
      pin: null,
      served: 'balanced-active',
    });
    expect(lastSyncAt).toBe(LAST_SEEN.toISOString());
  });

  it('reports a dead pin as the pin while serving the active model', async () => {
    const { service } = make({
      entries: [
        entry('ai_fast_model', {
          value: SERVED_FAST,
          source: 'stale',
          storedValue: PIN,
        }),
        entry('ai_default_model', { value: 'b' }),
        entry('ai_deep_model', { value: 'p' }),
      ],
    });

    const { intents } = await service.overview();

    expect(intents[0]).toMatchObject({ pin: PIN, served: SERVED_FAST });
  });

  it('reports the pending model with its gate status and run link', async () => {
    const changedAt = new Date('2026-09-01T00:00:00.000Z');
    const { service } = make({
      resolutions: [
        seededResolution('fast', {
          pendingModelId: PENDING_ID,
          gateStatus: 'failed',
          gateDetail: 'eval gate failed',
          gateRunUrl: RUN_URL,
          previousModelId: 'openrouter:vendor/old',
          changedAt,
        }),
        seededResolution('balanced'),
        seededResolution('powerful'),
      ],
    });

    const { intents } = await service.overview();

    expect(intents[0]).toMatchObject({
      activeModelId: SERVED_FAST,
      pendingModelId: PENDING_ID,
      gateStatus: 'failed',
      gateDetail: 'eval gate failed',
      gateRunUrl: RUN_URL,
      previousModelId: 'openrouter:vendor/old',
      changedAt: changedAt.toISOString(),
      releasedAt: null,
    });
    expect(intents[1]).toMatchObject({
      pendingModelId: null,
      gateStatus: null,
      changedAt: null,
    });
  });

  it("reports the selector's current candidate", async () => {
    const { service } = make();

    const { intents } = await service.overview();

    expect(intents.map((row) => row.candidateModelId)).toEqual(
      PLATFORM_FLOOR_ROWS.map((row) => row.id)
    );
  });

  it('reports a null candidate for an empty selector', async () => {
    const index = new ModelIndexCache(
      createModelIndexRepositoryStub(async () => [
        createIndexedModel({
          id: 'openrouter:vendor/unrelated',
          provider: OPENROUTER_PROVIDER,
        }),
      ])
    );
    await index.refresh();
    const { service } = make({ index });

    const { intents } = await service.overview();

    expect(intents.map((row) => row.candidateModelId)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('reports no sync time while the index lists no OpenRouter rows', async () => {
    const { service, indexRepo } = make();
    vi.mocked(indexRepo.lastSeenAt).mockResolvedValue(null);

    const { lastSyncAt } = await service.overview();

    expect(lastSyncAt).toBeNull();
    expect(indexRepo.lastSeenAt).toHaveBeenCalledWith(OPENROUTER_PROVIDER);
  });
});
