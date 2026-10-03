import { describe, expect, it } from 'vitest';

import type {
  UpstreamCatalog,
  UpstreamModel,
} from '../ports/openrouter-models.port';
import { OPENROUTER_ID_PREFIX } from './catalog-model';
import { PLATFORM_FLOOR_MODEL_IDS } from './floor-models';
import {
  canConcludeAbsence,
  findOpenRouterDrift,
  findPromotedDrift,
  watchedSlug,
} from './openrouter-watch';
import { UNPARSEABLE_MODEL_ID } from './upstream-discards';

const SONNET_ID = 'anthropic:claude-sonnet-5';

const WATCHED_ID = 'openrouter:deepseek/deepseek-v3.2';
const WATCHED_SLUG = 'deepseek/deepseek-v3.2';
const UPSTREAM_OUTPUT_COST = 0.0000044;
const REPRICE_FACTOR = 3;

function upstreamModel(
  id: string,
  overrides: Partial<UpstreamModel> = {}
): UpstreamModel {
  return {
    id,
    name: id,
    description: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    contextLength: 200_000,
    maxCompletionTokens: 32_768,
    promptCostPerToken: 0.0000006,
    completionCostPerToken: UPSTREAM_OUTPUT_COST,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    expirationDate: null,
    intelligenceIndex: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    reasoning: null,
    ...overrides,
  };
}

const WATCHED_SLUGS = PLATFORM_FLOOR_MODEL_IDS.flatMap((id) => {
  const slug = watchedSlug(id);
  return slug === null ? [] : [slug];
});

if (WATCHED_SLUGS.length < 2) {
  throw new Error('the watch spec needs two watched OpenRouter models');
}

function catalogOf(
  models: readonly UpstreamModel[],
  overrides: Partial<UpstreamCatalog> = {}
): UpstreamCatalog {
  return { models, complete: true, discarded: [], ...overrides };
}

/** Every watched slug present and unremarkable: a fixture that omits one asserts that model vanished. */
function upstreamInSync(overrides: UpstreamModel[] = []): UpstreamCatalog {
  const overridden = new Set(overrides.map((model) => model.id));
  return catalogOf([
    ...WATCHED_SLUGS.filter((slug) => !overridden.has(slug)).map((slug) =>
      upstreamModel(slug)
    ),
    ...overrides,
  ]);
}

describe('watchedSlug', () => {
  it('should map a platform default OpenRouter id onto its slug', () => {
    expect(watchedSlug('openrouter:deepseek/deepseek-v3.2')).toBe(
      'deepseek/deepseek-v3.2'
    );
    expect(watchedSlug('openrouter:moonshotai/kimi-k2.5')).toBe(
      'moonshotai/kimi-k2.5'
    );
    expect(watchedSlug('openrouter:minimax/minimax-m2.5')).toBe(
      'minimax/minimax-m2.5'
    );
  });

  it('should return null for a platform default billed outside OpenRouter', () => {
    expect(watchedSlug(SONNET_ID)).toBeNull();
    expect(watchedSlug('google:gemini-3.7-flash')).toBeNull();
  });

  it('should return null for an id that is not a platform default', () => {
    expect(watchedSlug('openrouter:z-ai/glm-5.2')).toBeNull();
    expect(watchedSlug('openrouter:qwen/qwen3.8-max')).toBeNull();
  });
});

describe('findOpenRouterDrift', () => {
  it('should report no finding when upstream reprices a watched model', () => {
    const upstream = upstreamInSync([
      upstreamModel(WATCHED_SLUG, {
        completionCostPerToken: UPSTREAM_OUTPUT_COST * REPRICE_FACTOR,
      }),
    ]);

    expect(findOpenRouterDrift(upstream)).toEqual([]);
  });

  it('should report an upstream expiration date as a deprecation finding', () => {
    const upstream = upstreamInSync([
      upstreamModel(WATCHED_SLUG, {
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    const findings = findOpenRouterDrift(upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(WATCHED_ID);
    expect(findings[0].kind).toBe('deprecation');
    expect(findings[0].detail).toContain('2026-12-31');
  });

  it('should never watch a model billed outside OpenRouter', () => {
    const upstream = upstreamInSync([
      upstreamModel('anthropic/claude-sonnet-5', {
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    expect(findOpenRouterDrift(upstream)).toEqual([]);
  });

  it('should report a watched model that vanished from OpenRouter', () => {
    const upstream = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG)
    );

    const findings = findOpenRouterDrift(upstream);

    expect(findings).toEqual([
      {
        modelId: WATCHED_ID,
        kind: 'unavailable',
        detail: expect.stringContaining(WATCHED_SLUG),
      },
    ]);
  });

  it('should report every watched model that vanished, not just the first', () => {
    const findings = findOpenRouterDrift(
      catalogOf([upstreamModel(WATCHED_SLUG)])
    );

    expect(findings).toHaveLength(WATCHED_SLUGS.length - 1);
    expect(findings.every((finding) => finding.kind === 'unavailable')).toBe(
      true
    );
  });

  it('should conclude nothing from an empty upstream payload', () => {
    expect(findOpenRouterDrift(catalogOf([]))).toEqual([]);
  });

  it('should conclude no absence from a catalog that stopped paginating early', () => {
    const truncated = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG),
      { complete: false }
    );

    expect(findOpenRouterDrift(truncated)).toEqual([]);
  });

  it('should not call a model gone when upstream published it unparseably', () => {
    const dropped = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG),
      { discarded: [WATCHED_SLUG] }
    );

    expect(findOpenRouterDrift(dropped)).toEqual([]);
  });

  it('should conclude no absence when no watched slug is recognizable', () => {
    const unrecognizable = catalogOf([
      upstreamModel('some-vendor/other-model'),
    ]);

    expect(findOpenRouterDrift(unrecognizable)).toEqual([]);
  });

  it('should match an upstream slug whose casing differs from the watched id', () => {
    const recased = catalogOf(
      upstreamInSync().models.map((model) =>
        model.id === WATCHED_SLUG
          ? upstreamModel(WATCHED_SLUG.toUpperCase())
          : upstreamModel(model.id)
      )
    );

    expect(findOpenRouterDrift(recased)).toEqual([]);
  });

  it('should not report a vanished model that is still listed', () => {
    const findings = findOpenRouterDrift(upstreamInSync());

    expect(findings).toEqual([]);
  });
});

describe('findPromotedDrift', () => {
  const PROMOTED_ID = 'openrouter:qwen/qwen3-max';
  const PROMOTED_SLUG = 'qwen/qwen3-max';

  it('should report a promoted model upstream stopped listing', () => {
    const findings = findPromotedDrift([PROMOTED_ID], upstreamInSync());

    expect(findings).toEqual([
      {
        modelId: PROMOTED_ID,
        kind: 'unavailable',
        detail: expect.stringContaining(PROMOTED_SLUG),
      },
    ]);
  });

  it('should not report a promoted model that is still listed', () => {
    const listed = upstreamInSync([upstreamModel(PROMOTED_SLUG)]);

    expect(findPromotedDrift([PROMOTED_ID], listed)).toEqual([]);
  });

  it('should not conclude absence from a truncated catalog', () => {
    const truncated = catalogOf(upstreamInSync().models, { complete: false });

    expect(findPromotedDrift([PROMOTED_ID], truncated)).toEqual([]);
  });

  it('should not conclude absence for an id upstream published unparseably', () => {
    const discarded = catalogOf(upstreamInSync().models, {
      discarded: [PROMOTED_SLUG],
    });

    expect(findPromotedDrift([PROMOTED_ID], discarded)).toEqual([]);
  });

  it('should not conclude absence when no watched slug is recognizable', () => {
    const unrecognizable = catalogOf([upstreamModel('some-vendor/other')]);

    expect(findPromotedDrift([PROMOTED_ID], unrecognizable)).toEqual([]);
  });

  it('should match an upstream slug whose casing differs from the stored id', () => {
    const storedWithCasing = `${OPENROUTER_ID_PREFIX}Qwen/Qwen3-Max`;
    const listed = upstreamInSync([upstreamModel(PROMOTED_SLUG)]);

    expect(findPromotedDrift([storedWithCasing], listed)).toEqual([]);
  });

  it('should skip promoted ids that OpenRouter does not bill', () => {
    expect(
      findPromotedDrift(['anthropic:claude-sonnet-5'], upstreamInSync())
    ).toEqual([]);
  });

  it('should not conclude absence while an anonymous discard is present', () => {
    const anonymous = catalogOf(upstreamInSync().models, {
      discarded: [UNPARSEABLE_MODEL_ID],
    });

    expect(findPromotedDrift([PROMOTED_ID], anonymous)).toEqual([]);
    expect(findOpenRouterDrift(anonymous)).toEqual([]);
  });
});

describe('canConcludeAbsence', () => {
  it('should be true for a complete, recognizable, fully attributed read', () => {
    expect(canConcludeAbsence(upstreamInSync())).toBe(true);
  });

  it('should be false for a truncated read', () => {
    expect(
      canConcludeAbsence(
        catalogOf(upstreamInSync().models, { complete: false })
      )
    ).toBe(false);
  });

  it('should be false when no watched slug is recognizable', () => {
    expect(
      canConcludeAbsence(catalogOf([upstreamModel('some-vendor/other')]))
    ).toBe(false);
  });

  it('should be false while an anonymous discard is present', () => {
    expect(
      canConcludeAbsence(
        catalogOf(upstreamInSync().models, {
          discarded: [UNPARSEABLE_MODEL_ID],
        })
      )
    ).toBe(false);
  });
});
