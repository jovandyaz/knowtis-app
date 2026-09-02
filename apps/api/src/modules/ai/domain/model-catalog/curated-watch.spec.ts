import { describe, expect, it } from 'vitest';

import {
  UNPARSEABLE_MODEL_ID,
  type UpstreamCatalog,
  type UpstreamModel,
} from '../ports/openrouter-models.port';
import {
  canConcludeAbsence,
  findLiteLlmDrift,
  findOpenRouterDrift,
  findPromotedDrift,
  openTierSlug,
} from './curated-watch';
import {
  CURATED_MODELS,
  OPENROUTER_ID_PREFIX,
} from './selectable-models.catalog';

const SONNET_ID = 'anthropic:claude-sonnet-5';
const SONNET_VENDORED_OUTPUT_COST = 0.00001;
const GPT_56_TERRA_ID = 'openai:gpt-5.6-terra';
const GPT_56_TERRA_VENDORED_OUTPUT_COST = 0.000012;

const GLM_ID = 'openrouter:z-ai/glm-5.2';
const GLM_SLUG = 'z-ai/glm-5.2';
const GLM_VENDORED_OUTPUT_COST = 0.0000044;

const VENDORED_OUTPUT_COSTS: ReadonlyMap<string, number> = new Map([
  ['anthropic:claude-haiku-4-5', 0.000005],
  ['openai:gpt-5.6-luna', 0.0000012],
  ['google:gemini-3.5-flash-lite', 0.0000025],
  [SONNET_ID, SONNET_VENDORED_OUTPUT_COST],
  [GPT_56_TERRA_ID, GPT_56_TERRA_VENDORED_OUTPUT_COST],
  ['google:gemini-3.7-flash', 0.00000375],
  ['anthropic:claude-opus-5', 0.000025],
  ['openai:gpt-5.6-sol', 0.00002],
  ['google:gemini-3.1-pro-preview', 0.000012],
  [GLM_ID, GLM_VENDORED_OUTPUT_COST],
]);

function vendoredOutputCost(id: string): number | undefined {
  return VENDORED_OUTPUT_COSTS.get(id);
}

function freeVendoredCost(freeId: string) {
  return (id: string): number | undefined => (id === freeId ? 0 : undefined);
}

const LIVE_IN_SYNC: Record<
  string,
  { output_cost_per_token?: number; deprecation_date?: string }
> = {
  'claude-haiku-4-5': { output_cost_per_token: 0.000005 },
  'gpt-5.6-luna': { output_cost_per_token: 0.0000012 },
  'gemini/gemini-3.5-flash-lite': { output_cost_per_token: 0.0000025 },
  'claude-sonnet-5': { output_cost_per_token: SONNET_VENDORED_OUTPUT_COST },
  'gpt-5.6-terra': { output_cost_per_token: GPT_56_TERRA_VENDORED_OUTPUT_COST },
  'gemini/gemini-3.7-flash': { output_cost_per_token: 0.00000375 },
  'claude-opus-5': { output_cost_per_token: 0.000025 },
  'gpt-5.6-sol': { output_cost_per_token: 0.00002 },
  'gemini/gemini-3.1-pro-preview': { output_cost_per_token: 0.000012 },
};

function liveWith(
  overrides: Record<
    string,
    { output_cost_per_token?: number; deprecation_date?: string }
  >
) {
  return { ...LIVE_IN_SYNC, ...overrides };
}

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
    completionCostPerToken: GLM_VENDORED_OUTPUT_COST,
    expirationDate: null,
    intelligenceIndex: null,
    outputModalities: ['text'],
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

describe('findLiteLlmDrift', () => {
  it('should report nothing while live pricing matches the vendored snapshot', () => {
    expect(findLiteLlmDrift(vendoredOutputCost, LIVE_IN_SYNC)).toEqual([]);
  });

  it('should ignore a difference too small to be a real price change', () => {
    const live = liveWith({
      'claude-sonnet-5': {
        output_cost_per_token: SONNET_VENDORED_OUTPUT_COST * 1.0000001,
      },
    });

    expect(findLiteLlmDrift(vendoredOutputCost, live)).toEqual([]);
  });

  it('should report a repriced model as price_drift carrying both prices', () => {
    const repriced = 0.000012;
    const live = liveWith({
      'claude-sonnet-5': { output_cost_per_token: repriced },
    });

    const findings = findLiteLlmDrift(vendoredOutputCost, live);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(SONNET_ID);
    expect(findings[0].kind).toBe('price_drift');
    expect(findings[0].detail).toContain(String(SONNET_VENDORED_OUTPUT_COST));
    expect(findings[0].detail).toContain(String(repriced));
  });

  it('should report an upstream deprecation date as a deprecation finding', () => {
    const live = liveWith({
      'gpt-5.6-terra': {
        output_cost_per_token: GPT_56_TERRA_VENDORED_OUTPUT_COST,
        deprecation_date: '2027-01-15',
      },
    });

    const findings = findLiteLlmDrift(vendoredOutputCost, live);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GPT_56_TERRA_ID);
    expect(findings[0].kind).toBe('deprecation');
    expect(findings[0].detail).toContain('2027-01-15');
  });

  it('should report both a deprecation and a price drift on the same model', () => {
    const live = liveWith({
      'gpt-5.6-terra': {
        output_cost_per_token: GPT_56_TERRA_VENDORED_OUTPUT_COST * 2,
        deprecation_date: '2027-01-15',
      },
    });

    const findings = findLiteLlmDrift(vendoredOutputCost, live);

    expect(findings.map((finding) => finding.kind)).toEqual([
      'deprecation',
      'price_drift',
    ]);
    expect(
      findings.every((finding) => finding.modelId === GPT_56_TERRA_ID)
    ).toBe(true);
  });

  it('should skip a curated model that upstream does not publish', () => {
    expect(findLiteLlmDrift(vendoredOutputCost, {})).toEqual([]);
  });

  it('should never watch open-tier models against LiteLLM', () => {
    const live = liveWith({
      'openrouter/z-ai/glm-5.2': {
        output_cost_per_token: 0.001,
        deprecation_date: '2026-09-01',
      },
    });

    expect(findLiteLlmDrift(vendoredOutputCost, live)).toEqual([]);
  });

  it('should skip the price comparison when the vendored cost is unknown', () => {
    const live = liveWith({
      'gpt-5.6-terra': {
        output_cost_per_token: GPT_56_TERRA_VENDORED_OUTPUT_COST * 10,
        deprecation_date: '2027-01-15',
      },
    });

    const findings = findLiteLlmDrift(() => undefined, live);

    expect(findings.map((finding) => finding.kind)).toEqual(['deprecation']);
  });

  it('should report a free curated model that upstream started charging for', () => {
    const live = { 'claude-sonnet-5': { output_cost_per_token: 0.000001 } };

    const findings = findLiteLlmDrift(freeVendoredCost(SONNET_ID), live);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(SONNET_ID);
    expect(findings[0].kind).toBe('price_drift');
  });

  it('should stay quiet while a free curated model is still free upstream', () => {
    const live = { 'claude-sonnet-5': { output_cost_per_token: 0 } };

    expect(findLiteLlmDrift(freeVendoredCost(SONNET_ID), live)).toEqual([]);
  });
});

describe('findOpenRouterDrift', () => {
  it('should report nothing while the upstream price matches the vendored cost', () => {
    const upstream = upstreamInSync();

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should ignore a price move the vendored cost still covers', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 1.1,
      }),
    ]);

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should stay silent when the upstream price falls far below the vendored cost', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 0.36,
      }),
    ]);

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should report a wide price move as price_drift carrying both prices', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 2,
      }),
    ]);

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
    expect(findings[0].kind).toBe('price_drift');
    expect(findings[0].detail).toBe(
      'OpenRouter output cost $8.80/M vs vendored $4.40/M'
    );
  });

  it('should report an upstream expiration date as a deprecation finding', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
    expect(findings[0].kind).toBe('deprecation');
    expect(findings[0].detail).toContain('2026-12-31');
  });

  it('should report both a deprecation and a price drift on the same model', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 3,
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings.map((finding) => finding.kind)).toEqual([
      'deprecation',
      'price_drift',
    ]);
    expect(findings.every((finding) => finding.modelId === GLM_ID)).toBe(true);
  });

  it('should never watch a model billed outside OpenRouter', () => {
    const upstream = upstreamInSync([
      upstreamModel('anthropic/claude-sonnet-5', {
        completionCostPerToken: SONNET_VENDORED_OUTPUT_COST * 10,
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should skip the price comparison when the vendored cost is unknown', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 10,
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    const findings = findOpenRouterDrift(() => undefined, upstream);

    expect(findings.map((finding) => finding.kind)).toEqual(['deprecation']);
  });

  it('should report a free curated model that upstream started charging for', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, { completionCostPerToken: 0.000001 }),
    ]);

    const findings = findOpenRouterDrift(freeVendoredCost(GLM_ID), upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
    expect(findings[0].kind).toBe('price_drift');
  });

  it('should stay quiet while a free curated model is still free upstream', () => {
    const upstream = upstreamInSync([
      upstreamModel(GLM_SLUG, { completionCostPerToken: 0 }),
    ]);

    expect(findOpenRouterDrift(freeVendoredCost(GLM_ID), upstream)).toEqual([]);
  });
  it('should report a curated model that vanished from OpenRouter', () => {
    const upstream = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== GLM_SLUG)
    );

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings).toEqual([
      {
        modelId: GLM_ID,
        kind: 'unavailable',
        detail: expect.stringContaining(GLM_SLUG),
      },
    ]);
  });

  it('should report every curated model that vanished, not just the first', () => {
    const findings = findOpenRouterDrift(
      vendoredOutputCost,
      catalogOf([upstreamModel(GLM_SLUG)])
    );

    expect(findings).toHaveLength(CURATED_OPEN_SLUGS.length - 1);
    expect(findings.every((finding) => finding.kind === 'unavailable')).toBe(
      true
    );
  });

  it('should conclude nothing from an empty upstream payload', () => {
    expect(findOpenRouterDrift(vendoredOutputCost, catalogOf([]))).toEqual([]);
  });

  it('should conclude no absence from a catalog that stopped paginating early', () => {
    const truncated = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== GLM_SLUG),
      { complete: false }
    );

    expect(findOpenRouterDrift(vendoredOutputCost, truncated)).toEqual([]);
  });

  it('should not call a model gone when upstream published it unparseably', () => {
    const dropped = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== GLM_SLUG),
      { discarded: [GLM_SLUG] }
    );

    expect(findOpenRouterDrift(vendoredOutputCost, dropped)).toEqual([]);
  });

  it('should conclude no absence when no curated slug is recognizable', () => {
    const unrecognizable = catalogOf([
      upstreamModel('some-vendor/other-model'),
    ]);

    expect(findOpenRouterDrift(vendoredOutputCost, unrecognizable)).toEqual([]);
  });

  it('should match an upstream slug whose casing differs from the curated id', () => {
    const recased = catalogOf(
      upstreamInSync().models.map((model) =>
        model.id === GLM_SLUG
          ? upstreamModel(GLM_SLUG.toUpperCase())
          : upstreamModel(model.id)
      )
    );

    expect(findOpenRouterDrift(vendoredOutputCost, recased)).toEqual([]);
  });

  it('should not report a vanished model that is still listed', () => {
    const findings = findOpenRouterDrift(vendoredOutputCost, upstreamInSync());

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
    expect(findOpenRouterDrift(vendoredOutputCost, anonymous)).toEqual([]);
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
