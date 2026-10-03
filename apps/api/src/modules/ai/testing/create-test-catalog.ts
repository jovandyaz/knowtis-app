import {
  ModelIndexCatalog,
  type IndexedModel,
  type ModelCatalog,
} from '@knowtis/ai-gateway';

import { createIndexedModel } from './create-indexed-model';

function directModel(
  overrides: Partial<IndexedModel> & Pick<IndexedModel, 'id' | 'provider'>
): IndexedModel {
  return createIndexedModel({
    source: 'models_dev',
    maxInputTokens: null,
    maxOutputTokens: null,
    ...overrides,
  });
}

const TEST_MODELS: readonly IndexedModel[] = [
  directModel({
    id: 'anthropic:claude-sonnet-4-20250514',
    provider: 'anthropic',
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015,
    cacheReadCostPerToken: 3e-7,
    cacheWriteCostPerToken: 0.00000375,
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
  }),
  directModel({
    id: 'anthropic:claude-haiku-4-5',
    provider: 'anthropic',
    inputCostPerToken: 8e-7,
    outputCostPerToken: 0.000004,
    cacheReadCostPerToken: 8e-8,
    cacheWriteCostPerToken: 0.000001,
  }),
  directModel({
    id: 'google:gemini-2.0-flash',
    provider: 'google',
    inputCostPerToken: 1e-7,
    outputCostPerToken: 4e-7,
  }),
  directModel({
    id: 'google:gemini-2.5-pro',
    provider: 'google',
    inputCostPerToken: 0.00000125,
    outputCostPerToken: 0.00001,
  }),
  directModel({
    id: 'openai:gpt-4o-mini',
    provider: 'openai',
    inputCostPerToken: 1.5e-7,
    outputCostPerToken: 6e-7,
  }),
];

/** Five direct-provider chat models; `openai:whisper-1` is priced per second from `TRANSCRIPTION_PRICES`. */
export function createTestCatalog(): ModelCatalog {
  return new ModelIndexCatalog(TEST_MODELS);
}
