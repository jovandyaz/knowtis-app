import type { ModelTier } from './ai.types';

export const CATALOG_MODEL_STATUSES = [
  'candidate',
  'promoted',
  'retired',
] as const;
export type CatalogModelStatus = (typeof CATALOG_MODEL_STATUSES)[number];

export const CATALOG_ALERT_KINDS = ['deprecation', 'price_drift'] as const;
export type CatalogAlertKind = (typeof CATALOG_ALERT_KINDS)[number];

export interface CatalogModelDto {
  id: string;
  label: string;
  description: string;
  status: CatalogModelStatus;
  tier: ModelTier;
  inputCostPerToken: number;
  outputCostPerToken: number;
  maxInputTokens: number;
  maxOutputTokens: number | null;
  elo: number | null;
  popularityRank: number | null;
  upstreamCreatedAt: string | null;
  upstreamExpirationDate: string | null;
  lastSeenAt: string;
  promotedAt: string | null;
}

export interface CatalogAlertDto {
  id: number;
  modelId: string;
  kind: CatalogAlertKind;
  detail: string;
  createdAt: string;
  resolvedAt: string | null;
}
