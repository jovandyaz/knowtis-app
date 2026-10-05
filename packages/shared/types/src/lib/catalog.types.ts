import type { ModelIntent, ModelTier } from './ai.types';

export const CATALOG_MODEL_STATUSES = ['candidate', 'promoted'] as const;
export type CatalogModelStatus = (typeof CATALOG_MODEL_STATUSES)[number];

/** The one status that serves a model to users, so several layers gate on it. */
export const PROMOTED_STATUS = 'promoted' as const satisfies CatalogModelStatus;

/** The queue status: what the sync discovers, and what retiring returns a model to. */
export const CANDIDATE_STATUS =
  'candidate' as const satisfies CatalogModelStatus;

export const CATALOG_ALERT_KINDS = [
  'unavailable',
  'pin_unavailable',
  'retirement_scheduled',
  'selector_empty',
  'resolution_pending',
  'gate_failed',
  'sync_rejected',
  'family_drift',
  'sync_stale',
] as const;
export type CatalogAlertKind = (typeof CATALOG_ALERT_KINDS)[number];

/** Kinds whose newly opened alert also goes to the ops webhook; the rest only show in the backoffice. */
export const NOTIFYING_ALERT_KINDS: readonly CatalogAlertKind[] = [
  'selector_empty',
  'gate_failed',
  'pin_unavailable',
  'sync_stale',
];

/** One row of `ai_model_resolutions` per platform intent. */
export const PLATFORM_SELECTOR_KEYS = [
  'platform.fast',
  'platform.balanced',
  'platform.powerful',
] as const;
export type PlatformSelectorKey = (typeof PLATFORM_SELECTOR_KEYS)[number];

/** Where a pending platform model stands in the eval gate. */
export const MODEL_GATE_STATUSES = ['pending', 'failed'] as const;
export type ModelGateStatus = (typeof MODEL_GATE_STATUSES)[number];

/** Why an eval gate verdict changed nothing: the model is no longer pending, or another intent already serves it. */
export const MODEL_GATE_VERDICT_SKIP_REASONS = [
  'not_pending',
  'conflict',
] as const;
export type ModelGateVerdictSkipReason =
  (typeof MODEL_GATE_VERDICT_SKIP_REASONS)[number];

/** A platform selector whose pending model awaits an eval gate verdict. */
export interface ModelGatePendingDto {
  selectorKey: PlatformSelectorKey;
  modelId: string;
}

/** The model each platform intent serves in production: its pin, else its active resolution. */
export type ModelGateActiveDto = Record<ModelIntent, string>;

/** What a gate verdict did. A verdict that changed nothing is still a 200, so CI can resend it. */
export type ModelGateVerdictResultDto =
  | { applied: true }
  | { applied: false; reason: ModelGateVerdictSkipReason };

export const CATALOG_LABEL_MAX_LENGTH = 100;
export const CATALOG_DESCRIPTION_MAX_LENGTH = 500;

/** Longest gate failure summary or run URL a model resolution keeps. */
export const AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH = 500;

/** Most a model may cost per output token to be admitted into the catalog. */
export const CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN = 0.00002;

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

export const CATALOG_SYNC_SKIP_REASONS = ['locked'] as const;
export type CatalogSyncSkipReason = (typeof CATALOG_SYNC_SKIP_REASONS)[number];

/** What one sync pass did. Counts are zero when `status` is `skipped`, and `skippedReason` is set only then. */
export interface CatalogSyncResultDto {
  status: CatalogSyncStatus;
  skippedReason: CatalogSyncSkipReason | null;
  upstream: number;
  candidates: number;
  /** Distinct model-index rows the pass upserted; zero when the index write failed. */
  indexed: number;
  alerts: number;
  failures: number;
}

/**
 * One row of the backoffice assignable-models listing: an eligible model-index
 * row of a provider the server holds a key for, or a promoted model (a promoted
 * id replaces its index row). `description` is empty for index rows. `tier` is
 * null when no selector picks the row and it is not open-weight.
 */
export interface AssignableModelDto {
  id: string;
  label: string;
  description: string;
  tier: ModelTier | null;
  provider: string;
  routableByServer: boolean;
  promoted: boolean;
}

/** Promotion is never implicit about reach: the tier decides which pool the model joins. */
export interface PromoteCatalogModelInput {
  tier: ModelTier;
}

export interface UpdateCatalogCopyInput {
  label?: string;
  description?: string;
}
