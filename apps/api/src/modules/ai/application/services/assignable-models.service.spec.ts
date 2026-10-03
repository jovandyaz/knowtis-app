import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { providerOf } from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import type { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import type { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';
import { createCatalogModel } from '../../testing/create-catalog-model';
import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { AssignableModelsService } from './assignable-models.service';

const SONNET_ID = 'anthropic:claude-sonnet-5-5';
const SONNET_LABEL = 'Claude Sonnet 5.5';
const GLM_ID = 'openrouter:z-ai/glm-5.2';
const IMAGE_ID = 'google:gemini-3-pro-image';
const ALIAS_ID = 'openrouter:~anthropic/claude-opus-latest';
const PROMOTED_ONLY_ID = 'openrouter:vendor/promoted-one';
const PROMOTED_ONLY_CREATED = new Date('2099-01-01T00:00:00Z');
const PROMOTED_LABEL = 'Promoted Sonnet';
const PROMOTED_DESCRIPTION = 'Promoted from the open catalog';
const PROVIDER_ORDER = ['anthropic', 'openai', 'google', 'openrouter'];

type RegistryStub = Pick<ProviderRegistryFactory, 'isModelAvailable'>;
type PromotedCacheStub = Pick<PromotedModelsCache, 'snapshot'>;

function makeService(opts: {
  configuredProviders?: readonly string[];
  promoted?: readonly CatalogModel[];
}) {
  const configured = new Set(opts.configuredProviders ?? []);
  const registry: RegistryStub = {
    isModelAvailable: (id: string) => configured.has(providerOf(id)),
  };
  const promoted: PromotedCacheStub = {
    snapshot: () => opts.promoted ?? [],
  };
  return new AssignableModelsService(
    registry as ProviderRegistryFactory,
    promoted as PromotedModelsCache,
    createSnapshotIndex()
  );
}

describe('AssignableModelsService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists an eligible index row with its name and intent tier', async () => {
    const rows = await makeService({
      configuredProviders: ['anthropic'],
    }).list();
    expect(rows.find((row) => row.id === SONNET_ID)).toEqual({
      id: SONNET_ID,
      label: SONNET_LABEL,
      description: '',
      tier: 'balanced',
      provider: 'anthropic',
      routableByServer: true,
      promoted: false,
    });
  });

  it('lists nothing from an unconfigured provider', async () => {
    const rows = await makeService({
      configuredProviders: ['anthropic'],
    }).list();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.provider === 'anthropic')).toBe(true);
  });

  it('never lists an image model or an alias id', async () => {
    const ids = (
      await makeService({
        configuredProviders: ['google', 'openrouter'],
      }).list()
    ).map((row) => row.id);
    expect(ids).not.toContain(IMAGE_ID);
    expect(ids).not.toContain(ALIAS_ID);
  });

  it('gives an openrouter glm row the open tier', async () => {
    const rows = await makeService({
      configuredProviders: ['openrouter'],
    }).list();
    expect(rows.find((row) => row.id === GLM_ID)).toMatchObject({
      tier: 'open',
      provider: 'openrouter',
    });
  });

  it('lists a promoted id once, promoted, with its stored copy', async () => {
    const rows = await makeService({
      configuredProviders: ['anthropic'],
      promoted: [
        createCatalogModel({
          id: SONNET_ID,
          label: PROMOTED_LABEL,
          description: PROMOTED_DESCRIPTION,
          tier: 'powerful',
        }),
      ],
    }).list();
    const matches = rows.filter((row) => row.id === SONNET_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      label: PROMOTED_LABEL,
      description: PROMOTED_DESCRIPTION,
      tier: 'powerful',
      promoted: true,
    });
  });

  it('still computes routability for a promoted row through the registry', async () => {
    const rows = await makeService({
      promoted: [createCatalogModel({ id: PROMOTED_ONLY_ID })],
    }).list();
    expect(rows).toEqual([
      expect.objectContaining({
        id: PROMOTED_ONLY_ID,
        routableByServer: false,
        promoted: true,
      }),
    ]);
  });

  it('orders by provider, then newest release, then id', async () => {
    const released = new Map(
      createSnapshotIndex()
        .catalog()
        .all()
        .map((row) => [row.id, row.releasedAt ?? ''])
    );
    const rows = await makeService({
      configuredProviders: PROVIDER_ORDER,
    }).list();
    const keys = rows.map((row) => [
      PROVIDER_ORDER.indexOf(row.provider),
      released.get(row.id) ?? '',
      row.id,
    ]);
    const expected = [...keys].sort(
      (a, b) =>
        (a[0] as number) - (b[0] as number) ||
        (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0) ||
        (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)
    );
    expect(keys).toEqual(expected);
  });

  it('sorts a promoted-only row by its upstream creation date', async () => {
    const rows = await makeService({
      configuredProviders: ['openrouter'],
      promoted: [
        createCatalogModel({
          id: PROMOTED_ONLY_ID,
          upstreamCreatedAt: PROMOTED_ONLY_CREATED,
        }),
      ],
    }).list();
    expect(rows[0]?.id).toBe(PROMOTED_ONLY_ID);
  });
});
