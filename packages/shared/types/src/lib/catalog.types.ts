import type { ModelTier } from './ai.types';

export const CATALOG_MODEL_STATUSES = [
  'candidate',
  'promoted',
  'retired',
] as const;
export type CatalogModelStatus = (typeof CATALOG_MODEL_STATUSES)[number];

/** The one status that serves a model to users, so several layers gate on it. */
export const PROMOTED_STATUS = 'promoted' as const satisfies CatalogModelStatus;

export const CATALOG_ALERT_KINDS = [
  'deprecation',
  'price_drift',
  'unavailable',
] as const;
export type CatalogAlertKind = (typeof CATALOG_ALERT_KINDS)[number];

export const CATALOG_LABEL_MAX_LENGTH = 100;
export const CATALOG_DESCRIPTION_MAX_LENGTH = 500;

/** Ceiling the platform absorbs on the free tier. Above it a model is reachable only with BYOK. */
export const FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN = 0.0000044;

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
  intelligenceIndex: number | null;
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

export interface CatalogOverviewDto {
  promoted: CatalogModelDto[];
  alerts: CatalogAlertDto[];
}

export interface PaginatedCandidatesDto {
  items: CatalogModelDto[];
  total: number;
  page: number;
  limit: number;
}

export const CATALOG_SYNC_STATUSES = ['completed', 'skipped'] as const;
export type CatalogSyncStatus = (typeof CATALOG_SYNC_STATUSES)[number];

export const CATALOG_SYNC_SKIP_REASONS = ['flag_disabled', 'locked'] as const;
export type CatalogSyncSkipReason = (typeof CATALOG_SYNC_SKIP_REASONS)[number];

/** What one sync pass did. Counts are zero when `status` is `skipped`, and `skippedReason` is set only then. */
export interface CatalogSyncResultDto {
  status: CatalogSyncStatus;
  skippedReason: CatalogSyncSkipReason | null;
  upstream: number;
  candidates: number;
  alerts: number;
  failures: number;
}

/** Promotion is never implicit about reach: the tier decides which pool the model joins. */
export interface PromoteCatalogModelInput {
  tier: ModelTier;
}

export interface UpdateCatalogCopyInput {
  label?: string;
  description?: string;
}
