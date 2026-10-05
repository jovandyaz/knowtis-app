import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';
import type { ModelIntent } from '@knowtis/shared-types';

import type { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { ResolutionRollbackUnavailableError } from '../../domain/errors/resolution-rollback-unavailable.error';
import { SELECTOR_KEY_BY_INTENT } from '../../domain/model-catalog/platform-resolution';
import type { CatalogAlertsWriter } from '../../infrastructure/catalog/catalog-alerts.writer';
import { PLATFORM_FLOOR_ROWS } from '../../testing/create-floor-rows';
import { createIndexedModel } from '../../testing/create-indexed-model';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import {
  createModelResolutionRepositoryStub,
  createResolutionsStub,
  seededResolution,
} from '../../testing/platform-resolutions';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import {
  InvalidAIConfigError,
  type AIConfigEntry,
  type AIConfigService,
} from './ai-config.service';
import { PlatformResolutionsAdminService } from './platform-resolutions-admin.service';

const PIN = 'openrouter:vendor/pinned';
const SERVED_FAST = 'openrouter:minimax/minimax-m2.5';
const PENDING_ID = 'openrouter:vendor/next';
const RUN_URL = 'https://ci.example/runs/9';
const LAST_SEEN = new Date('2026-10-03T06:00:00.000Z');
const PREVIOUS_FAST = 'openrouter:vendor/old';
const ACTOR_ID = 'admin-user-id';
const FAST_PAIR = {
  activeModelId: SERVED_FAST,
  previousModelId: PREVIOUS_FAST,
};
const FAST_WITH_PREVIOUS = seededResolution('fast', {
  previousModelId: PREVIOUS_FAST,
  changedAt: new Date('2026-09-01T00:00:00.000Z'),
});
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
    assertNotServedByAnotherIntent: vi
      .fn<AIConfigService['assertNotServedByAnotherIntent']>()
      .mockResolvedValue(undefined),
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
  const resolutionCache = createResolutionsStub();
  const refresh = vi.spyOn(resolutionCache, 'refresh');
  const audit = {
    record: vi.fn<AdminAuditService['record']>().mockResolvedValue(undefined),
  };
  const alerts = {
    resolvePending: vi
      .fn<CatalogAlertsWriter['resolvePending']>()
      .mockResolvedValue(undefined),
  };
  const service = new PlatformResolutionsAdminService(
    resolutions,
    indexRepo,
    config as unknown as AIConfigService,
    resolutionCache,
    audit as unknown as AdminAuditService,
    alerts as unknown as CatalogAlertsWriter
  );
  return { service, indexRepo, config, resolutions, refresh, audit, alerts };
}

function withPreviousFast() {
  return make({
    resolutions: [
      FAST_WITH_PREVIOUS,
      seededResolution('balanced'),
      seededResolution('powerful'),
    ],
  });
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

  it('reports a null candidate for a selector the stored index leaves empty', async () => {
    const { service, indexRepo } = make();
    vi.mocked(indexRepo.listListed).mockResolvedValue([
      createIndexedModel({
        id: 'openrouter:vendor/unrelated',
        provider: OPENROUTER_PROVIDER,
      }),
    ]);

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

  describe('rollback', () => {
    it('rolls back the pair the admin confirmed, not the row it reads', async () => {
      const { service, resolutions } = make({
        resolutions: [
          seededResolution('fast', {
            activeModelId: PREVIOUS_FAST,
            previousModelId: SERVED_FAST,
          }),
          seededResolution('balanced'),
          seededResolution('powerful'),
        ],
      });

      await service.rollback('platform.fast', FAST_PAIR, ACTOR_ID);

      expect(resolutions.rollback).toHaveBeenCalledWith(
        'platform.fast',
        FAST_PAIR,
        SNAPSHOT_DATE
      );
      expect(
        vi.mocked(resolutions.list).mock.invocationCallOrder[0]
      ).toBeGreaterThan(
        vi.mocked(resolutions.rollback).mock.invocationCallOrder[0]
      );
    });

    it('answers the overview read after the roll back', async () => {
      const { service, resolutions, refresh, config } = withPreviousFast();

      const overview = await service.rollback(
        'platform.fast',
        FAST_PAIR,
        ACTOR_ID
      );

      expect(overview.intents.map((row) => row.intent)).toEqual([
        'fast',
        'balanced',
        'powerful',
      ]);
      const rolledBackAt = vi.mocked(resolutions.rollback).mock
        .invocationCallOrder[0];
      expect(Math.max(...refresh.mock.invocationCallOrder)).toBeGreaterThan(
        rolledBackAt
      );
      expect(
        config.getEffectiveConfig.mock.invocationCallOrder[0]
      ).toBeGreaterThan(Math.max(...refresh.mock.invocationCallOrder));
    });

    it('audits ai_resolution.rolled_back with the confirmed models', async () => {
      const { service, audit } = withPreviousFast();

      await service.rollback('platform.fast', FAST_PAIR, ACTOR_ID);

      expect(audit.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'ai_resolution.rolled_back',
        targetType: 'ai_model_resolution',
        targetId: 'platform.fast',
        before: { active: SERVED_FAST },
        after: { active: PREVIOUS_FAST },
      });
    });

    it('refuses a roll back whose confirmed pair is no longer current', async () => {
      const { service, resolutions, audit } = withPreviousFast();
      vi.mocked(resolutions.rollback).mockResolvedValue(null);

      await expect(
        service.rollback('platform.fast', FAST_PAIR, ACTOR_ID)
      ).rejects.toBeInstanceOf(ResolutionRollbackUnavailableError);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("resolves the restored model's resolution_pending once the roll back clears it", async () => {
      const { service, resolutions, alerts } = withPreviousFast();
      vi.mocked(resolutions.rollback).mockResolvedValue({
        clearedPending: true,
      });

      await service.rollback('platform.fast', FAST_PAIR, ACTOR_ID);

      expect(alerts.resolvePending).toHaveBeenCalledWith(PREVIOUS_FAST);
    });

    it('leaves resolution_pending alone when the roll back cleared nothing', async () => {
      const { service, alerts } = withPreviousFast();

      await service.rollback('platform.fast', FAST_PAIR, ACTOR_ID);

      expect(alerts.resolvePending).not.toHaveBeenCalled();
    });

    it('refuses a previous model another intent serves', async () => {
      const { service, resolutions, config, audit } = withPreviousFast();
      config.assertNotServedByAnotherIntent.mockRejectedValue(
        new InvalidAIConfigError('clash')
      );

      await expect(
        service.rollback('platform.fast', FAST_PAIR, ACTOR_ID)
      ).rejects.toBeInstanceOf(InvalidAIConfigError);
      expect(config.assertNotServedByAnotherIntent).toHaveBeenCalledWith(
        PREVIOUS_FAST,
        'fast'
      );
      expect(resolutions.rollback).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('checks the clash against resolutions refreshed from the store', async () => {
      const { service, refresh, config } = withPreviousFast();

      await service.rollback('platform.fast', FAST_PAIR, ACTOR_ID);

      expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
        config.assertNotServedByAnotherIntent.mock.invocationCallOrder[0]
      );
    });
  });
});
