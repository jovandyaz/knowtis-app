import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogModelDto } from '@knowtis/shared-types';

import { RolesGuard } from '../authorization/roles.guard';
import { AiCatalogController } from './ai-catalog.controller';
import type { AiCatalogAdminService } from './application/services/ai-catalog-admin.service';
import { InvalidAIConfigError } from './application/services/ai-config.service';
import type { AssignableModelsService } from './application/services/assignable-models.service';
import type { PlatformResolutionsAdminService } from './application/services/platform-resolutions-admin.service';
import { ResolutionRollbackUnavailableError } from './domain/errors/resolution-rollback-unavailable.error';

const ACTOR = { id: 'admin-user-id' } as never;
const MODEL_ID = 'openrouter:vendor/promoted-one';
const ALERT_ID = 7;
const NO_RESOLUTIONS = { intents: [], lastSyncAt: null };
const FAST_PAIR = {
  activeModelId: 'openrouter:z-ai/glm-5.3',
  previousModelId: 'openrouter:moonshotai/kimi-k2.5',
};

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
  let assignable: {
    [K in keyof AssignableModelsService]: ReturnType<typeof vi.fn>;
  };
  let resolutions: {
    [K in keyof PlatformResolutionsAdminService]: ReturnType<typeof vi.fn>;
  };
  let controller: AiCatalogController;

  beforeEach(() => {
    catalog = {
      overview: vi.fn().mockResolvedValue({ promoted: [], alerts: [] }),
      listCandidates: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
      promote: vi.fn().mockResolvedValue(model),
      retire: vi.fn().mockResolvedValue(model),
      updateCopy: vi.fn().mockResolvedValue(model),
      resolveAlert: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue({
        status: 'completed',
        skippedReason: null,
        upstream: 120,
        candidates: 97,
        indexed: 640,
        alerts: 2,
        failures: 0,
      }),
    };
    assignable = {
      list: vi.fn().mockResolvedValue([]),
    };
    resolutions = {
      overview: vi.fn().mockResolvedValue(NO_RESOLUTIONS),
      rollback: vi.fn().mockResolvedValue(NO_RESOLUTIONS),
    };
    controller = new AiCatalogController(
      catalog as never,
      assignable as never,
      resolutions as never
    );
  });

  it('serves the catalog overview', async () => {
    expect(await controller.list()).toEqual({
      promoted: [],
      alerts: [],
    });
  });

  it('serves the platform resolutions straight from the service', async () => {
    expect(await controller.listResolutions()).toEqual({
      intents: [],
      lastSyncAt: null,
    });
  });

  it('rolls back the pair the admin confirmed, on their behalf', async () => {
    expect(
      await controller.rollbackResolution(
        ACTOR,
        { selectorKey: 'platform.fast' },
        FAST_PAIR
      )
    ).toEqual(NO_RESOLUTIONS);
    expect(resolutions.rollback).toHaveBeenCalledWith(
      'platform.fast',
      FAST_PAIR,
      'admin-user-id'
    );
  });

  it('answers 409 when the intent no longer holds the confirmed pair', async () => {
    resolutions.rollback.mockRejectedValue(
      new ResolutionRollbackUnavailableError('changed since it was loaded')
    );

    await expect(
      controller.rollbackResolution(
        ACTOR,
        { selectorKey: 'platform.fast' },
        FAST_PAIR
      )
    ).rejects.toThrow(ConflictException);
  });

  it('answers 400 when another intent serves the previous model', async () => {
    resolutions.rollback.mockRejectedValue(new InvalidAIConfigError('clash'));

    await expect(
      controller.rollbackResolution(
        ACTOR,
        { selectorKey: 'platform.fast' },
        FAST_PAIR
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('surfaces any other roll back failure untouched', async () => {
    const failure = new Error('resolutions table locked');
    resolutions.rollback.mockRejectedValue(failure);

    await expect(
      controller.rollbackResolution(
        ACTOR,
        { selectorKey: 'platform.fast' },
        FAST_PAIR
      )
    ).rejects.toBe(failure);
  });

  describe('requires the admin role', () => {
    function contextOf(role: string): ExecutionContext {
      return {
        getHandler: () => AiCatalogController.prototype.listResolutions,
        getClass: () => AiCatalogController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as unknown as ExecutionContext;
    }

    it('refuses a member', () => {
      const guard = new RolesGuard(new Reflector());

      expect(() => guard.canActivate(contextOf('user'))).toThrow(
        ForbiddenException
      );
    });

    it('admits an admin', () => {
      const guard = new RolesGuard(new Reflector());

      expect(guard.canActivate(contextOf('admin'))).toBe(true);
    });
  });

  it('serves the assignable models straight from the service', async () => {
    expect(await controller.listAssignable()).toEqual([]);
  });

  it('surfaces a failing assignable lookup instead of masking it', async () => {
    const failure = new Error('catalog unavailable');
    assignable.list.mockRejectedValueOnce(failure);

    await expect(controller.listAssignable()).rejects.toBe(failure);
  });

  it('applies the house defaults when the query omits them', async () => {
    catalog.listCandidates.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });

    await controller.listCandidates({});

    expect(catalog.listCandidates).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      search: undefined,
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
      indexed: 640,
      alerts: 2,
      failures: 0,
    });
    expect(catalog.sync).toHaveBeenCalledWith('admin-user-id');
  });

  it('passes a skipped sync through instead of dressing it as a success', async () => {
    catalog.sync.mockResolvedValue({
      status: 'skipped',
      skippedReason: 'locked',
      upstream: 0,
      candidates: 0,
      indexed: 0,
      alerts: 0,
      failures: 0,
    });

    await expect(controller.sync(ACTOR)).resolves.toEqual({
      status: 'skipped',
      skippedReason: 'locked',
      upstream: 0,
      candidates: 0,
      indexed: 0,
      alerts: 0,
      failures: 0,
    });
  });
});
