import { describe, expect, it } from 'vitest';

import {
  LiteLLMCatalog,
  MODEL_PRICES_SNAPSHOT,
  toLiteLLMKey,
} from '@knowtis/ai-gateway';

import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import { unpricedCuratedModels } from './curated-pricing';

const [firstCurated] = CURATED_MODELS;
const firstKey = toLiteLLMKey(firstCurated.id) as string;

function catalogPricing(overrides: Record<string, unknown>) {
  return new LiteLLMCatalog({
    [firstKey]: {
      mode: 'chat',
      input_cost_per_token: 0.000001,
      output_cost_per_token: 0.000002,
      max_input_tokens: 200000,
      ...overrides,
    },
  });
}

describe('unpricedCuratedModels', () => {
  it('accepts the vendored snapshot', () => {
    expect(
      unpricedCuratedModels(new LiteLLMCatalog(MODEL_PRICES_SNAPSHOT))
    ).toEqual([]);
  });

  it('names every curated model when the catalog is empty', () => {
    expect(unpricedCuratedModels(new LiteLLMCatalog(null))).toEqual(
      CURATED_MODELS.map((model) => model.id)
    );
  });

  it('names a model priced on input but not on output', () => {
    expect(
      unpricedCuratedModels(catalogPricing({ output_cost_per_token: null }))
    ).toContain(firstCurated.id);
  });

  it('names a model the catalog no longer reports as chat', () => {
    expect(
      unpricedCuratedModels(catalogPricing({ mode: 'embedding' }))
    ).toContain(firstCurated.id);
  });

  it('names a model left without a context window', () => {
    expect(
      unpricedCuratedModels(catalogPricing({ max_input_tokens: null }))
    ).toContain(firstCurated.id);
  });

  it('leaves out the one model a partial catalog does price', () => {
    expect(unpricedCuratedModels(catalogPricing({}))).not.toContain(
      firstCurated.id
    );
  });
});
