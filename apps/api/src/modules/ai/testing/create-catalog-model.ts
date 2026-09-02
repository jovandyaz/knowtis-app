import type { CatalogModel } from '../domain/model-catalog/catalog-model';

const LAST_SEEN_AT = new Date('2026-08-10T00:00:00.000Z');
const PROMOTED_AT = new Date('2026-08-09T00:00:00.000Z');

export function createCatalogModel(
  overrides: Partial<CatalogModel> & { id: string }
): CatalogModel {
  return {
    label: overrides.id,
    description: '',
    tier: 'open',
    status: 'promoted',
    inputCostPerToken: 1e-7,
    outputCostPerToken: 4e-7,
    maxInputTokens: 128_000,
    maxOutputTokens: 8_192,
    intelligenceIndex: null,
    reasoning: null,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: new Date(LAST_SEEN_AT),
    promotedBy: null,
    promotedAt: new Date(PROMOTED_AT),
    ...overrides,
  };
}
