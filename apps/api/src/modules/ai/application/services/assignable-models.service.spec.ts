import { describe, expect, it } from 'vitest';

import { providerOf } from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import type { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import type { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { AssignableModelsService } from './assignable-models.service';

const ANTHROPIC_CURATED = 'anthropic:claude-sonnet-5';
const OPENAI_CURATED = 'openai:gpt-5.6-sol';
const PROMOTED_ID = 'openrouter:vendor/promoted-one';
const PROMOTED_LABEL = 'Promoted One';
const PROMOTED_DESCRIPTION = 'Promoted from the open catalog';
/** A promoted row sharing a curated id: curated must win, mirroring catalogUnion. */
const CURATED_COLLISION_ID = ANTHROPIC_CURATED;

type RegistryStub = Pick<ProviderRegistryFactory, 'isModelAvailable'>;
type PromotedCacheStub = Pick<PromotedModelsCache, 'snapshot'>;

/** Typed against the real ports so a shape change breaks compilation here instead of at runtime. */
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
    promoted as PromotedModelsCache
  );
}

describe('AssignableModelsService', () => {
  it('marks a curated model of an unconfigured provider as needsKey, never hides it', async () => {
    const svc = makeService({ configuredProviders: ['anthropic'] });
    const rows = await svc.list();
    const openai = rows.find((row) => row.id === OPENAI_CURATED);
    expect(openai).toMatchObject({
      routableByServer: false,
      needsKey: true,
      promoted: false,
    });
  });

  it('marks a curated model of a configured provider as routable', async () => {
    const svc = makeService({ configuredProviders: ['anthropic'] });
    const rows = await svc.list();
    const anthropic = rows.find((row) => row.id === ANTHROPIC_CURATED);
    expect(anthropic).toMatchObject({
      routableByServer: true,
      needsKey: false,
      promoted: false,
    });
  });

  it('lists every curated model whatever the key state', async () => {
    const svc = makeService({});
    const rows = await svc.list();
    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(CURATED_MODELS.map((model) => model.id))
    );
  });

  it('serves the curated label, an empty description and the provider of the id', async () => {
    const svc = makeService({});
    const rows = await svc.list();
    const anthropic = rows.find((row) => row.id === ANTHROPIC_CURATED);
    expect(anthropic).toMatchObject({
      label: 'Sonnet 5',
      description: '',
      tier: 'balanced',
      provider: 'anthropic',
    });
  });

  it('appends promoted rows flagged promoted with their stored copy', async () => {
    const svc = makeService({
      configuredProviders: ['openrouter'],
      promoted: [
        createCatalogModel({
          id: PROMOTED_ID,
          label: PROMOTED_LABEL,
          description: PROMOTED_DESCRIPTION,
        }),
      ],
    });
    const rows = await svc.list();
    const promoted = rows.find((row) => row.id === PROMOTED_ID);
    expect(promoted).toMatchObject({
      label: PROMOTED_LABEL,
      description: PROMOTED_DESCRIPTION,
      tier: 'open',
      provider: 'openrouter',
      routableByServer: true,
      needsKey: false,
      promoted: true,
    });
  });

  it('still computes routability for a promoted row through the registry', async () => {
    const svc = makeService({
      promoted: [createCatalogModel({ id: PROMOTED_ID })],
    });
    const rows = await svc.list();
    const promoted = rows.find((row) => row.id === PROMOTED_ID);
    expect(promoted).toMatchObject({
      routableByServer: false,
      needsKey: false,
      promoted: true,
    });
  });

  it('never duplicates an id: the curated row wins over a promoted one', async () => {
    const svc = makeService({
      configuredProviders: ['anthropic'],
      promoted: [
        createCatalogModel({
          id: CURATED_COLLISION_ID,
          label: 'Shadowing row',
        }),
      ],
    });
    const rows = await svc.list();
    const matches = rows.filter((row) => row.id === CURATED_COLLISION_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ label: 'Sonnet 5', promoted: false });
  });
});
