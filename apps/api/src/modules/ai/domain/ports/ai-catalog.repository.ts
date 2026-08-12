import type {
  CatalogAlertKind,
  CatalogModelStatus,
  ModelTier,
} from '@knowtis/shared-types';

import type { CatalogAlert } from '../model-catalog/catalog-alert';
import type { CatalogModel } from '../model-catalog/catalog-model';

export const AI_CATALOG_REPOSITORY = Symbol('AI_CATALOG_REPOSITORY');

export interface CandidateUpsert {
  id: string;
  label: string;
  description: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  maxInputTokens: number;
  maxOutputTokens: number | null;
  intelligenceIndex: number | null;
  upstreamCreatedAt: Date | null;
  upstreamExpirationDate: Date | null;
}

/** An admin decision on a tracked model. Promotion carries the tier because that is what decides who can reach the model. */
export type CatalogStatusChange =
  | { status: 'promoted'; tier: ModelTier }
  | { status: 'retired' };

export interface AiCatalogRepository {
  listByStatus(status: CatalogModelStatus): Promise<CatalogModel[]>;
  /** Records an upstream sighting: inserts as `candidate`, or refreshes metadata and `lastSeenAt` on an existing model without touching its status. Upstream `label`/`description` only land while the model is still a candidate. */
  upsertCandidate(model: CandidateUpsert): Promise<void>;
  /** Resolves the updated model, or null when `id` is unknown. Stamps `promotedBy`/`promotedAt` when moving to `promoted`. */
  setStatus(
    id: string,
    change: CatalogStatusChange,
    actorId: string
  ): Promise<CatalogModel | null>;
  /** Resolves the updated model, or null when `id` is unknown. Omitted fields keep their stored value. */
  updateCopy(
    id: string,
    patch: { label?: string; description?: string }
  ): Promise<CatalogModel | null>;
  listAlerts(unresolvedOnly: boolean): Promise<CatalogAlert[]>;
  /** No-op while an unresolved alert already exists for the same `(modelId, kind)`. */
  createAlert(
    modelId: string,
    kind: CatalogAlertKind,
    detail: string
  ): Promise<void>;
  /** Resolves to whether this call closed the alert; false when it is unknown or already resolved, which preserves the original resolution time. */
  resolveAlert(id: number): Promise<boolean>;
  /** One ranked page of candidates: scored models first, unscored last, `id` breaking ties. `search` matches label or id, case-insensitively. */
  listCandidates(params: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{ items: CatalogModel[]; total: number }>;
}
