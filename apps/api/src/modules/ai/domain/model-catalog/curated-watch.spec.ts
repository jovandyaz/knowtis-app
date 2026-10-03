import { describe, expect, it } from 'vitest';

import type {
  UpstreamCatalog,
  UpstreamModel,
} from '../ports/openrouter-models.port';
import {
  canConcludeAbsence,
  findOpenRouterDrift,
  findPromotedDrift,
  openTierSlug,
} from './curated-watch';
import {
  CURATED_MODELS,
  OPENROUTER_ID_PREFIX,
} from './selectable-models.catalog';
import { UNPARSEABLE_MODEL_ID } from './upstream-discards';

const SONNET_ID = 'anthropic:claude-sonnet-5';

const GLM_ID = 'openrouter:z-ai/glm-5.2';
const GLM_SLUG = 'z-ai/glm-5.2';
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

const CURATED_OPEN_SLUGS = CURATED_MODELS.map((model) =>
  openTierSlug(model.id)
).filter((slug): slug is string => slug !== null);

function catalogOf(
  models: readonly UpstreamModel[],
  overrides: Partial<UpstreamCatalog> = {}
): UpstreamCatalog {
  return { models, complete: true, discarded: [], ...overrides };
}

/** Every curated open-tier slug present and unremarkable: a fixture that omits one asserts that model vanished. */
function upstreamInSync(overrides: UpstreamModel[] = []): UpstreamCatalog {
  const overridden = new Set(overrides.map((model) => model.id));
  return catalogOf([
    ...CURATED_OPEN_SLUGS.filter((slug) => !overridden.has(slug)).map((slug) =>
      upstreamModel(slug)
    ),
    ...overrides,
  ]);
}

describe('openTierSlug', () => {
  it('should map a curated open-tier id onto its OpenRouter slug', () => {
    expect(openTierSlug('openrouter:z-ai/glm-5.2')).toBe('z-ai/glm-5.2');
    expect(openTierSlug('openrouter:deepseek/deepseek-v3.2')).toBe(
      'deepseek/deepseek-v3.2'
    );
    expect(openTierSlug('openrouter:moonshotai/kimi-k2.5')).toBe(
      'moonshotai/kimi-k2.5'
    );
    expect(openTierSlug('openrouter:minimax/minimax-m2.5')).toBe(
      'minimax/minimax-m2.5'
    );
  });

  it('should return null for a curated model billed outside OpenRouter', () => {
    expect(openTierSlug(SONNET_ID)).toBeNull();
    expect(openTierSlug('google:gemini-3.7-flash')).toBeNull();
  });

  it('should return null for an id that is not curated at all', () => {
    expect(openTierSlug('openrouter:qwen/qwen3.8-max')).toBeNull();
  });
});

describe('findOpenRouterDrift', () => {
  it('should report no finding when upstream reprices a curated model', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: UPSTREAM_OUTPUT_COST * REPRICE_FACTOR,
      }),
    ]);

    expect(findOpenRouterDrift(upstream)).toEqual([]);
  });

  it('should report an upstream expiration date as a deprecation finding', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    const findings = findOpenRouterDrift(upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
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

  it('should report a curated model that vanished from OpenRouter', () => {
    const upstream = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== GLM_SLUG)
    );

    const findings = findOpenRouterDrift(upstream);

    expect(findings).toEqual([
      {
        modelId: GLM_ID,
        kind: 'unavailable',
        detail: expect.stringContaining(GLM_SLUG),
      },
    ]);
  });

  it('should report every curated model that vanished, not just the first', () => {
    const findings = findOpenRouterDrift(catalogOf([upstreamModel(GLM_SLUG)]));

    expect(findings).toHaveLength(CURATED_OPEN_SLUGS.length - 1);
    expect(findings.every((finding) => finding.kind === 'unavailable')).toBe(
      true
    );
  });

  it('should conclude nothing from an empty upstream payload', () => {
    expect(findOpenRouterDrift(catalogOf([]))).toEqual([]);
  });

  it('should conclude no absence from a catalog that stopped paginating early', () => {
    const truncated = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== GLM_SLUG),
      { complete: false }
    );

    expect(findOpenRouterDrift(truncated)).toEqual([]);
  });

  it('should not call a model gone when upstream published it unparseably', () => {
    const dropped = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== GLM_SLUG),
      { discarded: [GLM_SLUG] }
    );

    expect(findOpenRouterDrift(dropped)).toEqual([]);
  });

  it('should conclude no absence when no curated slug is recognizable', () => {
    const unrecognizable = catalogOf([
      upstreamModel('some-vendor/other-model'),
    ]);

    expect(findOpenRouterDrift(unrecognizable)).toEqual([]);
  });

  it('should match an upstream slug whose casing differs from the curated id', () => {
    const recased = catalogOf(
      upstreamInSync().models.map((model) =>
        model.id === GLM_SLUG
          ? upstreamModel(GLM_SLUG.toUpperCase())
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

  it('should not conclude absence when no curated slug is recognizable', () => {
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

  it('should be false when no curated slug is recognizable', () => {
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
