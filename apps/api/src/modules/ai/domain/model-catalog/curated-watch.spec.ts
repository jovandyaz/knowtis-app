import { describe, expect, it } from 'vitest';

import type { UpstreamModel } from '../ports/openrouter-models.port';
import {
  findLiteLlmDrift,
  findOpenRouterDrift,
  openTierSlug,
} from './curated-watch';

const SONNET_ID = 'anthropic:claude-sonnet-5';
const SONNET_VENDORED_OUTPUT_COST = 0.00001;
const GPT_54_ID = 'openai:gpt-5.4';
const GPT_54_VENDORED_OUTPUT_COST = 0.000015;

const GLM_ID = 'openrouter:z-ai/glm-5.2';
const GLM_SLUG = 'z-ai/glm-5.2';
const GLM_VENDORED_OUTPUT_COST = 0.0000044;

const VENDORED_OUTPUT_COSTS: ReadonlyMap<string, number> = new Map([
  ['anthropic:claude-haiku-4-5-20251001', 0.000005],
  ['openai:gpt-5.4-mini', 0.0000045],
  ['google:gemini-3.1-flash-lite', 0.0000015],
  [SONNET_ID, SONNET_VENDORED_OUTPUT_COST],
  [GPT_54_ID, GPT_54_VENDORED_OUTPUT_COST],
  ['google:gemini-3.5-flash', 0.000009],
  ['anthropic:claude-opus-4-8', 0.000025],
  ['openai:gpt-5.6', 0.00003],
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
  'claude-haiku-4-5-20251001': { output_cost_per_token: 0.000005 },
  'gpt-5.4-mini': { output_cost_per_token: 0.0000045 },
  'gemini/gemini-3.1-flash-lite': { output_cost_per_token: 0.0000015 },
  'claude-sonnet-5': { output_cost_per_token: SONNET_VENDORED_OUTPUT_COST },
  'gpt-5.4': { output_cost_per_token: GPT_54_VENDORED_OUTPUT_COST },
  'gemini/gemini-3.5-flash': { output_cost_per_token: 0.000009 },
  'claude-opus-4-8': { output_cost_per_token: 0.000025 },
  'gpt-5.6': { output_cost_per_token: 0.00003 },
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
    ...overrides,
  };
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
    expect(openTierSlug('google:gemini-3.5-flash')).toBeNull();
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
      'gpt-5.4': {
        output_cost_per_token: GPT_54_VENDORED_OUTPUT_COST,
        deprecation_date: '2027-01-15',
      },
    });

    const findings = findLiteLlmDrift(vendoredOutputCost, live);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GPT_54_ID);
    expect(findings[0].kind).toBe('deprecation');
    expect(findings[0].detail).toContain('2027-01-15');
  });

  it('should report both a deprecation and a price drift on the same model', () => {
    const live = liveWith({
      'gpt-5.4': {
        output_cost_per_token: GPT_54_VENDORED_OUTPUT_COST * 2,
        deprecation_date: '2027-01-15',
      },
    });

    const findings = findLiteLlmDrift(vendoredOutputCost, live);

    expect(findings.map((finding) => finding.kind)).toEqual([
      'deprecation',
      'price_drift',
    ]);
    expect(findings.every((finding) => finding.modelId === GPT_54_ID)).toBe(
      true
    );
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
      'gpt-5.4': {
        output_cost_per_token: GPT_54_VENDORED_OUTPUT_COST * 10,
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
    const upstream = [upstreamModel(GLM_SLUG)];

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should ignore a price move the vendored cost still covers', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 1.1,
      }),
    ];

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should stay silent when the upstream price falls far below the vendored cost', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 0.36,
      }),
    ];

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should report a wide price move as price_drift carrying both prices', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 2,
      }),
    ];

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
    expect(findings[0].kind).toBe('price_drift');
    expect(findings[0].detail).toBe(
      'OpenRouter output cost $8.80/M vs vendored $4.40/M'
    );
  });

  it('should report an upstream expiration date as a deprecation finding', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, {
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ];

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
    expect(findings[0].kind).toBe('deprecation');
    expect(findings[0].detail).toContain('2026-12-31');
  });

  it('should report both a deprecation and a price drift on the same model', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 3,
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ];

    const findings = findOpenRouterDrift(vendoredOutputCost, upstream);

    expect(findings.map((finding) => finding.kind)).toEqual([
      'deprecation',
      'price_drift',
    ]);
    expect(findings.every((finding) => finding.modelId === GLM_ID)).toBe(true);
  });

  it('should skip a curated model upstream no longer publishes', () => {
    expect(findOpenRouterDrift(vendoredOutputCost, [])).toEqual([]);
  });

  it('should never watch a model billed outside OpenRouter', () => {
    const upstream = [
      upstreamModel('anthropic/claude-sonnet-5', {
        completionCostPerToken: SONNET_VENDORED_OUTPUT_COST * 10,
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ];

    expect(findOpenRouterDrift(vendoredOutputCost, upstream)).toEqual([]);
  });

  it('should skip the price comparison when the vendored cost is unknown', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, {
        completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 10,
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ];

    const findings = findOpenRouterDrift(() => undefined, upstream);

    expect(findings.map((finding) => finding.kind)).toEqual(['deprecation']);
  });

  it('should report a free curated model that upstream started charging for', () => {
    const upstream = [
      upstreamModel(GLM_SLUG, { completionCostPerToken: 0.000001 }),
    ];

    const findings = findOpenRouterDrift(freeVendoredCost(GLM_ID), upstream);

    expect(findings).toHaveLength(1);
    expect(findings[0].modelId).toBe(GLM_ID);
    expect(findings[0].kind).toBe('price_drift');
  });

  it('should stay quiet while a free curated model is still free upstream', () => {
    const upstream = [upstreamModel(GLM_SLUG, { completionCostPerToken: 0 })];

    expect(findOpenRouterDrift(freeVendoredCost(GLM_ID), upstream)).toEqual([]);
  });
});
