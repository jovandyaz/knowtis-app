import type { CatalogModelStatus, ModelTier } from '@knowtis/shared-types';

/** A model tracked in the AI catalog: discovered upstream as a candidate, then promoted or retired by an admin. */
export interface CatalogModel {
  id: string;
  label: string;
  description: string;
  status: CatalogModelStatus;
  tier: ModelTier;
  inputCostPerToken: number;
  outputCostPerToken: number;
  maxInputTokens: number;
  maxOutputTokens: number | null;
  intelligenceIndex: number | null;
  upstreamCreatedAt: Date | null;
  upstreamExpirationDate: Date | null;
  lastSeenAt: Date;
  promotedBy: string | null;
  promotedAt: Date | null;
}
