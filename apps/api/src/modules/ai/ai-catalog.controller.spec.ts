import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogModelDto } from '@knowtis/shared-types';

import { AiCatalogController } from './ai-catalog.controller';
import type { AiCatalogAdminService } from './application/services/ai-catalog-admin.service';

const ACTOR = { id: 'admin-user-id' } as never;
const MODEL_ID = 'openrouter:vendor/promoted-one';
const ALERT_ID = 7;

const model: CatalogModelDto = {
  id: MODEL_ID,
  label: 'Promoted One',
  description: '',
  status: 'promoted',
  tier: 'open',
  inputCostPerToken: 1e-7,
  outputCostPerToken: 4e-7,
  maxInputTokens: 128_000,
  maxOutputTokens: 8_192,
  intelligenceIndex: null,
  upstreamCreatedAt: null,
  upstreamExpirationDate: null,
  lastSeenAt: '2026-08-10T00:00:00.000Z',
  promotedAt: '2026-08-10T00:00:00.000Z',
};

describe('AiCatalogController', () => {
  let catalog: {
    [K in keyof AiCatalogAdminService]: ReturnType<typeof vi.fn>;
  };
  let controller: AiCatalogController;

  beforeEach(() => {
    catalog = {
      overview: vi
        .fn()
        .mockResolvedValue({ candidates: [], promoted: [], alerts: [] }),
      promote: vi.fn().mockResolvedValue(model),
      retire: vi.fn().mockResolvedValue(model),
      updateCopy: vi.fn().mockResolvedValue(model),
      resolveAlert: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue({
        status: 'completed',
        skippedReason: null,
        upstream: 120,
        candidates: 97,
        alerts: 2,
        failures: 0,
      }),
    };
    controller = new AiCatalogController(catalog as never);
  });

  it('serves the catalog overview', async () => {
    expect(await controller.list()).toEqual({
      candidates: [],
      promoted: [],
      alerts: [],
    });
  });

  it('promotes with the caller as actor and the requested tier', async () => {
    const promoted = await controller.promote(
      ACTOR,
      { id: MODEL_ID },
      {
        tier: 'fast',
      }
    );

    expect(catalog.promote).toHaveBeenCalledWith(
      MODEL_ID,
      'fast',
      'admin-user-id'
    );
    expect(promoted).toBe(model);
  });

  it('answers 404 when promoting an unknown model', async () => {
    catalog.promote.mockResolvedValue(null);

    await expect(
      controller.promote(ACTOR, { id: MODEL_ID }, { tier: 'open' })
    ).rejects.toThrow(NotFoundException);
  });

  it('retires with the caller as actor', async () => {
    await controller.retire(ACTOR, { id: MODEL_ID });

    expect(catalog.retire).toHaveBeenCalledWith(MODEL_ID, 'admin-user-id');
  });

  it('answers 404 when retiring an unknown model', async () => {
    catalog.retire.mockResolvedValue(null);

    await expect(controller.retire(ACTOR, { id: MODEL_ID })).rejects.toThrow(
      NotFoundException
    );
  });

  it('patches only the fields the caller sent', async () => {
    await controller.updateCopy(ACTOR, { id: MODEL_ID }, { label: 'Edited' });

    expect(catalog.updateCopy).toHaveBeenCalledWith(
      MODEL_ID,
      { label: 'Edited' },
      'admin-user-id'
    );
  });

  it('rejects an empty patch instead of bumping the row', async () => {
    await expect(
      controller.updateCopy(ACTOR, { id: MODEL_ID }, {})
    ).rejects.toThrow(BadRequestException);
    expect(catalog.updateCopy).not.toHaveBeenCalled();
  });

  it('answers 404 when patching an unknown model', async () => {
    catalog.updateCopy.mockResolvedValue(null);

    await expect(
      controller.updateCopy(ACTOR, { id: MODEL_ID }, { label: 'Edited' })
    ).rejects.toThrow(NotFoundException);
  });

  it('resolves an alert by numeric id', async () => {
    await controller.resolveAlert(ACTOR, ALERT_ID);

    expect(catalog.resolveAlert).toHaveBeenCalledWith(
      ALERT_ID,
      'admin-user-id'
    );
  });
  it('runs a sync on behalf of the admin who asked for it', async () => {
    await expect(controller.sync(ACTOR)).resolves.toEqual({
      status: 'completed',
      skippedReason: null,
      upstream: 120,
      candidates: 97,
      alerts: 2,
      failures: 0,
    });
    expect(catalog.sync).toHaveBeenCalledWith('admin-user-id');
  });

  it('passes a skipped sync through instead of dressing it as a success', async () => {
    catalog.sync.mockResolvedValue({
      status: 'skipped',
      skippedReason: 'flag_disabled',
      upstream: 0,
      candidates: 0,
      alerts: 0,
      failures: 0,
    });

    await expect(controller.sync(ACTOR)).resolves.toEqual({
      status: 'skipped',
      skippedReason: 'flag_disabled',
      upstream: 0,
      candidates: 0,
      alerts: 0,
      failures: 0,
    });
  });
});
