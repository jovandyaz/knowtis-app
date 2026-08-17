import type { CatalogModelStatus, ModelTier } from '@knowtis/shared-types';

/** A model tracked in the AI catalog: discovered upstream as a candidate, promoted by an admin, and back to candidate when retired. */
export interface CatalogModel {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly status: CatalogModelStatus;
  readonly tier: ModelTier;
  readonly inputCostPerToken: number;
  readonly outputCostPerToken: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number | null;
  readonly intelligenceIndex: number | null;
  readonly upstreamCreatedAt: Date | null;
  readonly upstreamExpirationDate: Date | null;
  readonly lastSeenAt: Date;
  readonly promotedBy: string | null;
  readonly promotedAt: Date | null;
}
