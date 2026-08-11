import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  CatalogAlertDto,
  CatalogModelDto,
  CatalogModelStatus,
  CatalogOverviewDto,
  ModelTier,
  UpdateCatalogCopyInput,
} from '@knowtis/shared-types';

import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import type { CatalogAlert } from '../../domain/model-catalog/catalog-alert';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';

const CANDIDATE_STATUS = 'candidate' as const satisfies CatalogModelStatus;
const PROMOTED_STATUS = 'promoted' as const satisfies CatalogModelStatus;
const RETIRED_STATUS = 'retired' as const satisfies CatalogModelStatus;
const OPEN_ALERTS_ONLY = true;

const CATALOG_MODEL_TARGET = 'ai_catalog_model';
const CATALOG_ALERT_TARGET = 'ai_catalog_alert';

function toCatalogModelDto(model: CatalogModel): CatalogModelDto {
  return {
    id: model.id,
    label: model.label,
    description: model.description,
    status: model.status,
    tier: model.tier,
    inputCostPerToken: model.inputCostPerToken,
    outputCostPerToken: model.outputCostPerToken,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    intelligenceIndex: model.intelligenceIndex,
    upstreamCreatedAt: model.upstreamCreatedAt?.toISOString() ?? null,
    upstreamExpirationDate: model.upstreamExpirationDate?.toISOString() ?? null,
    lastSeenAt: model.lastSeenAt.toISOString(),
    promotedAt: model.promotedAt?.toISOString() ?? null,
  };
}

function toCatalogAlertDto(alert: CatalogAlert): CatalogAlertDto {
  return {
    id: alert.id,
    modelId: alert.modelId,
    kind: alert.kind,
    detail: alert.detail,
    createdAt: alert.createdAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
  };
}

/** Admin side of the model catalog: what the backoffice lists and the four decisions it can take. */
@Injectable()
export class AiCatalogAdminService {
  private readonly logger = new Logger(AiCatalogAdminService.name);

  constructor(
    @Inject(AI_CATALOG_REPOSITORY)
    private readonly repository: AiCatalogRepository,
    private readonly audit: AdminAuditService,
    private readonly promotedModels: PromotedModelsCache
  ) {}

  async overview(): Promise<CatalogOverviewDto> {
    const [candidates, promoted, alerts] = await Promise.all([
      this.repository.listByStatus(CANDIDATE_STATUS),
      this.repository.listByStatus(PROMOTED_STATUS),
      this.repository.listAlerts(OPEN_ALERTS_ONLY),
    ]);
    return {
      candidates: candidates.map(toCatalogModelDto),
      promoted: promoted.map(toCatalogModelDto),
      alerts: alerts.map(toCatalogAlertDto),
    };
  }

  /** Resolves the promoted model, or null when `id` is unknown. The tier decides which pool it joins; the stored price still decides who pays for it. */
  async promote(
    id: string,
    tier: ModelTier,
    actorId: string
  ): Promise<CatalogModelDto | null> {
    const model = await this.repository.setStatus(
      id,
      { status: PROMOTED_STATUS, tier },
      actorId
    );
    if (!model) {
      return null;
    }
    await this.audit.record({
      actorId,
      action: 'ai_catalog.promoted',
      targetType: CATALOG_MODEL_TARGET,
      targetId: id,
      after: { status: model.status, tier: model.tier },
    });
    await this.refreshPromoted();
    return toCatalogModelDto(model);
  }

  /** Resolves the retired model, or null when `id` is unknown. */
  async retire(id: string, actorId: string): Promise<CatalogModelDto | null> {
    const model = await this.repository.setStatus(
      id,
      { status: RETIRED_STATUS },
      actorId
    );
    if (!model) {
      return null;
    }
    await this.audit.record({
      actorId,
      action: 'ai_catalog.retired',
      targetType: CATALOG_MODEL_TARGET,
      targetId: id,
      after: { status: model.status },
    });
    await this.refreshPromoted();
    return toCatalogModelDto(model);
  }

  /** Resolves the updated model, or null when `id` is unknown. */
  async updateCopy(
    id: string,
    patch: UpdateCatalogCopyInput,
    actorId: string
  ): Promise<CatalogModelDto | null> {
    const model = await this.repository.updateCopy(id, patch);
    if (!model) {
      return null;
    }
    await this.audit.record({
      actorId,
      action: 'ai_catalog.copy_updated',
      targetType: CATALOG_MODEL_TARGET,
      targetId: id,
      after: { label: model.label, description: model.description },
    });
    await this.refreshPromoted();
    return toCatalogModelDto(model);
  }

  /** Idempotent: re-resolving an alert changes nothing and is not audited a second time. */
  async resolveAlert(id: number, actorId: string): Promise<void> {
    if (!(await this.repository.resolveAlert(id))) {
      return;
    }
    await this.audit.record({
      actorId,
      action: 'ai_catalog.alert_resolved',
      targetType: CATALOG_ALERT_TARGET,
      targetId: String(id),
    });
  }

  /** The cache also refreshes on an interval, so a failure here only costs freshness. */
  private async refreshPromoted(): Promise<void> {
    try {
      await this.promotedModels.refresh();
    } catch (error) {
      this.logger.warn(
        'Failed to refresh promoted models after a catalog change; the interval will catch up',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }
}
