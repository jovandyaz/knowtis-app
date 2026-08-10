import type {
  CatalogAlertKind,
  CatalogModelStatus,
} from '@knowtis/shared-types';

import type {
  AiCatalogAlertRow,
  AiCatalogModelRow,
} from '../../../../database/schema';

export const AI_CATALOG_REPOSITORY = Symbol('AI_CATALOG_REPOSITORY');

export interface CandidateUpsert {
  id: string;
  label: string;
  description: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  maxInputTokens: number;
  maxOutputTokens: number | null;
  elo: number | null;
  popularityRank: number | null;
  upstreamCreatedAt: Date | null;
  upstreamExpirationDate: Date | null;
}

export interface AiCatalogRepository {
  listByStatus(status: CatalogModelStatus): Promise<AiCatalogModelRow[]>;
  /** Records an upstream sighting: inserts as `candidate`, or refreshes metadata and `lastSeenAt` on an existing row without touching its status. Upstream `label`/`description` only land while the row is still a candidate. */
  upsertCandidate(model: CandidateUpsert): Promise<void>;
  /** Resolves the updated row, or null when `id` is unknown. Stamps `promotedBy`/`promotedAt` when moving to `promoted`. */
  setStatus(
    id: string,
    status: CatalogModelStatus,
    actorId: string
  ): Promise<AiCatalogModelRow | null>;
  /** Resolves the updated row, or null when `id` is unknown. Omitted fields keep their stored value. */
  updateCopy(
    id: string,
    patch: { label?: string; description?: string }
  ): Promise<AiCatalogModelRow | null>;
  listAlerts(unresolvedOnly: boolean): Promise<AiCatalogAlertRow[]>;
  /** No-op while an unresolved alert already exists for the same `(modelId, kind)`. */
  createAlert(
    modelId: string,
    kind: CatalogAlertKind,
    detail: string
  ): Promise<void>;
  /** No-op when the alert is unknown or already resolved, so the original resolution time is preserved. */
  resolveAlert(id: number): Promise<void>;
}
