import type { AiCatalogModelRow } from '../../../database';

const FIXED_TIMESTAMP = new Date('2026-08-10T00:00:00.000Z');

export function createCatalogModelRow(
  overrides: Partial<AiCatalogModelRow> & { id: string }
): AiCatalogModelRow {
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
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: FIXED_TIMESTAMP,
    promotedBy: null,
    promotedAt: FIXED_TIMESTAMP,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}
