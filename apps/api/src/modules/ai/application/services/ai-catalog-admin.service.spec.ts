import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogAlert } from '../../domain/model-catalog/catalog-alert';
import type {
  AiCatalogRepository,
  CatalogStatusChange,
} from '../../domain/ports/ai-catalog.repository';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { AiCatalogAdminService } from './ai-catalog-admin.service';

const ACTOR_ID = 'admin-user-id';
const MODEL_ID = 'openrouter:vendor/promoted-one';
const CANDIDATE_ID = 'openrouter:vendor/candidate-one';
const ALERT_ID = 7;

const COMPLETED_SYNC = {
  status: 'completed',
  skippedReason: null,
  upstream: 120,
  candidates: 97,
  alerts: 2,
  failures: 0,
} as const;

const alert: CatalogAlert = {
  id: ALERT_ID,
  modelId: MODEL_ID,
  kind: 'price_drift',
  detail: 'output cost rose by 40%',
  createdAt: new Date('2026-08-10T10:00:00.000Z'),
  resolvedAt: null,
};

describe('AiCatalogAdminService', () => {
  let repository: {
    [K in keyof AiCatalogRepository]: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let promotedCache: PromotedModelsCache;
  let syncTask: { run: ReturnType<typeof vi.fn> };
  let service: AiCatalogAdminService;

  beforeEach(() => {
    repository = {
      listByStatus: vi.fn().mockResolvedValue([]),
      upsertCandidate: vi.fn(),
      setStatus: vi
        .fn()
        .mockResolvedValue(createCatalogModel({ id: MODEL_ID })),
      updateCopy: vi
        .fn()
        .mockResolvedValue(createCatalogModel({ id: MODEL_ID })),
      listAlerts: vi.fn().mockResolvedValue([]),
      createAlert: vi.fn(),
      resolveAlert: vi.fn().mockResolvedValue(true),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    promotedCache = new PromotedModelsCache(repository as never);
    vi.spyOn(promotedCache, 'refresh');
    syncTask = { run: vi.fn().mockResolvedValue({ ...COMPLETED_SYNC }) };
    service = new AiCatalogAdminService(
      repository as never,
      audit as never,
      promotedCache,
      syncTask as never
    );
  });

  describe('overview', () => {
    it('serves candidates, promoted models and open alerts as DTOs', async () => {
      const promoted = createCatalogModel({
        id: MODEL_ID,
        label: 'Promoted One',
        tier: 'open',
      });
      const candidate = createCatalogModel({
        id: CANDIDATE_ID,
        status: 'candidate',
        promotedAt: null,
      });
      repository.listByStatus.mockImplementation(async (status: string) =>
        status === 'promoted' ? [promoted] : [candidate]
      );
      repository.listAlerts.mockResolvedValue([alert]);

      const overview = await service.overview();

      expect(overview.candidates.map((m) => m.id)).toEqual([CANDIDATE_ID]);
      expect(overview.promoted[0]).toMatchObject({
        id: MODEL_ID,
        label: 'Promoted One',
        tier: 'open',
        status: 'promoted',
      });
      expect(overview.alerts[0]).toMatchObject({
        id: ALERT_ID,
        kind: 'price_drift',
        resolvedAt: null,
      });
    });

    it('serializes timestamps as ISO strings and keeps nullable ones null', async () => {
      repository.listByStatus.mockImplementation(async (status: string) =>
        status === 'promoted'
          ? [
              createCatalogModel({
                id: MODEL_ID,
                upstreamCreatedAt: new Date('2026-01-02T03:04:05.000Z'),
                upstreamExpirationDate: null,
              }),
            ]
          : []
      );

      const [model] = (await service.overview()).promoted;

      expect(model.upstreamCreatedAt).toBe('2026-01-02T03:04:05.000Z');
      expect(model.upstreamExpirationDate).toBeNull();
      expect(model.lastSeenAt).toBe(new Date(model.lastSeenAt).toISOString());
    });

    it('asks only for alerts that are still open', async () => {
      await service.overview();

      expect(repository.listAlerts).toHaveBeenCalledWith(true);
    });
  });

  describe('promote', () => {
    it('records the chosen tier and refreshes the picker without waiting for the interval', async () => {
      const result = await service.promote(MODEL_ID, 'fast', ACTOR_ID);

      const change: CatalogStatusChange = { status: 'promoted', tier: 'fast' };
      expect(repository.setStatus).toHaveBeenCalledWith(
        MODEL_ID,
        change,
        ACTOR_ID
      );
      expect(promotedCache.refresh).toHaveBeenCalled();
      expect(result?.id).toBe(MODEL_ID);
    });

    it('audits the promotion against the model it changed', async () => {
      repository.setStatus.mockResolvedValue(
        createCatalogModel({ id: MODEL_ID, tier: 'fast', status: 'promoted' })
      );

      await service.promote(MODEL_ID, 'fast', ACTOR_ID);

      expect(audit.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'ai_catalog.promoted',
        targetType: 'ai_catalog_model',
        targetId: MODEL_ID,
        after: { status: 'promoted', tier: 'fast' },
      });
    });

    it('leaves the cache and the audit alone when the model is unknown', async () => {
      repository.setStatus.mockResolvedValue(null);

      expect(await service.promote(MODEL_ID, 'open', ACTOR_ID)).toBeNull();
      expect(promotedCache.refresh).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refreshes the picker and surfaces the failure when the audit write fails', async () => {
      audit.record.mockRejectedValue(new Error('audit down'));

      await expect(service.promote(MODEL_ID, 'fast', ACTOR_ID)).rejects.toThrow(
        'audit down'
      );
      expect(promotedCache.refresh).toHaveBeenCalled();
    });
  });

  describe('retire', () => {
    it('retires without a tier and refreshes the picker', async () => {
      repository.setStatus.mockResolvedValue(
        createCatalogModel({ id: MODEL_ID, status: 'retired' })
      );

      const result = await service.retire(MODEL_ID, ACTOR_ID);

      const change: CatalogStatusChange = { status: 'retired' };
      expect(repository.setStatus).toHaveBeenCalledWith(
        MODEL_ID,
        change,
        ACTOR_ID
      );
      expect(promotedCache.refresh).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ai_catalog.retired' })
      );
      expect(result?.status).toBe('retired');
    });

    it('returns null for an unknown model without touching the cache', async () => {
      repository.setStatus.mockResolvedValue(null);

      expect(await service.retire(MODEL_ID, ACTOR_ID)).toBeNull();
      expect(promotedCache.refresh).not.toHaveBeenCalled();
    });

    it('refreshes the picker and surfaces the failure when the audit write fails', async () => {
      audit.record.mockRejectedValue(new Error('audit down'));

      await expect(service.retire(MODEL_ID, ACTOR_ID)).rejects.toThrow(
        'audit down'
      );
      expect(promotedCache.refresh).toHaveBeenCalled();
    });
  });

  describe('updateCopy', () => {
    it('refreshes the picker so edited copy does not lag a minute behind', async () => {
      repository.updateCopy.mockResolvedValue(
        createCatalogModel({ id: MODEL_ID, label: 'Edited' })
      );

      const result = await service.updateCopy(
        MODEL_ID,
        { label: 'Edited' },
        ACTOR_ID
      );

      expect(repository.updateCopy).toHaveBeenCalledWith(MODEL_ID, {
        label: 'Edited',
      });
      expect(promotedCache.refresh).toHaveBeenCalled();
      expect(result?.label).toBe('Edited');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ai_catalog.copy_updated' })
      );
    });

    it('returns null for an unknown model', async () => {
      repository.updateCopy.mockResolvedValue(null);

      expect(await service.updateCopy(MODEL_ID, {}, ACTOR_ID)).toBeNull();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refreshes the picker and surfaces the failure when the audit write fails', async () => {
      audit.record.mockRejectedValue(new Error('audit down'));

      await expect(
        service.updateCopy(MODEL_ID, { label: 'Edited' }, ACTOR_ID)
      ).rejects.toThrow('audit down');
      expect(promotedCache.refresh).toHaveBeenCalled();
    });
  });

  describe('resolveAlert', () => {
    it('resolves and audits against the alert', async () => {
      await service.resolveAlert(ALERT_ID, ACTOR_ID);

      expect(repository.resolveAlert).toHaveBeenCalledWith(ALERT_ID);
      expect(audit.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'ai_catalog.alert_resolved',
        targetType: 'ai_catalog_alert',
        targetId: String(ALERT_ID),
      });
    });

    it('does not refresh the promoted cache, which alerts never change', async () => {
      await service.resolveAlert(ALERT_ID, ACTOR_ID);

      expect(promotedCache.refresh).not.toHaveBeenCalled();
    });

    it('does not audit a second time when the alert was already resolved', async () => {
      repository.resolveAlert.mockResolvedValue(false);

      await service.resolveAlert(ALERT_ID, ACTOR_ID);

      expect(audit.record).not.toHaveBeenCalled();
    });
  });
  describe('sync', () => {
    it('reports what the pass wrote', async () => {
      await expect(service.sync(ACTOR_ID)).resolves.toEqual(COMPLETED_SYNC);
      expect(syncTask.run).toHaveBeenCalledTimes(1);
    });

    it('audits a completed pass with its counts', async () => {
      await service.sync(ACTOR_ID);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ACTOR_ID,
          action: 'ai_catalog.synced',
          after: { candidates: 97, alerts: 2, failures: 0 },
        })
      );
    });

    it('refreshes the promoted cache, since a pass reprices promoted rows too', async () => {
      await service.sync(ACTOR_ID);

      expect(promotedCache.refresh).toHaveBeenCalledTimes(1);
    });

    it('neither audits nor refreshes a pass that never ran', async () => {
      syncTask.run.mockResolvedValue({
        status: 'skipped',
        skippedReason: 'locked',
        upstream: 0,
        candidates: 0,
        alerts: 0,
        failures: 0,
      });

      await expect(service.sync(ACTOR_ID)).resolves.toEqual({
        status: 'skipped',
        skippedReason: 'locked',
        upstream: 0,
        candidates: 0,
        alerts: 0,
        failures: 0,
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(promotedCache.refresh).not.toHaveBeenCalled();
    });

    it('propagates an upstream failure instead of reporting an empty success', async () => {
      syncTask.run.mockRejectedValue(new Error('openrouter down'));

      await expect(service.sync(ACTOR_ID)).rejects.toThrow('openrouter down');
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
