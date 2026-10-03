import type { IndexedModel } from '@knowtis/ai-gateway';

export function createIndexedModel(
  overrides: Partial<IndexedModel> & { id: string }
): IndexedModel {
  return {
    provider: 'openrouter',
    name: overrides.id,
    family: null,
    releasedAt: null,
    status: 'active',
    toolCall: true,
    structuredOutput: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
    inputCostPerToken: 1e-7,
    outputCostPerToken: 4e-7,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    maxInputTokens: 128_000,
    maxOutputTokens: 8_192,
    reasoning: null,
    canonical: overrides.id,
    openWeights: null,
    retiresAt: null,
    source: 'openrouter',
    ...overrides,
  };
}
