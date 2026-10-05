import { Inject, Injectable, Logger } from '@nestjs/common';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';
import {
  MODEL_INTENTS,
  type PlatformResolutionDto,
  type PlatformResolutionsDto,
  type PlatformSelectorKey,
  type RollbackResolutionInput,
} from '@knowtis/shared-types';

import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { ResolutionRollbackUnavailableError } from '../../domain/errors/resolution-rollback-unavailable.error';
import { resolvePlatformIntent } from '../../domain/model-catalog/model-selectors';
import {
  intentOfSelectorKey,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import { servedIndexRows } from '../../domain/model-catalog/served-index-rows';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';
import { CatalogAlertsWriter } from '../../infrastructure/catalog/catalog-alerts.writer';
import { PlatformResolutionCache } from '../../infrastructure/catalog/platform-resolution.cache';
import {
  AIConfigService,
  INTENT_CONFIG_KEYS,
  type AIConfigEntry,
} from './ai-config.service';

/** What the backoffice shows per platform intent, and its roll back. Mirrors `/internal/model-gate/active`: a supported pin serves, otherwise the active resolution does. */
@Injectable()
export class PlatformResolutionsAdminService {
  private readonly logger = new Logger(PlatformResolutionsAdminService.name);

  constructor(
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly resolutions: ModelResolutionRepository,
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly indexRepository: ModelIndexRepository,
    private readonly config: AIConfigService,
    private readonly resolutionCache: PlatformResolutionCache,
    private readonly audit: AdminAuditService,
    private readonly alerts: CatalogAlertsWriter
  ) {}

  async overview(): Promise<PlatformResolutionsDto> {
    const [rows, entries, lastSeenAt, listed] = await Promise.all([
      this.resolutions.list(),
      this.config.getEffectiveConfig(),
      this.indexRepository.lastSeenAt(OPENROUTER_PROVIDER),
      this.indexRepository.listListed(),
    ]);
    const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
    const now = new Date();
    const indexRows = servedIndexRows(listed);
    const intents = MODEL_INTENTS.flatMap((intent) => {
      const row = rows.find(
        (read) => intentOfSelectorKey(read.selectorKey) === intent
      );
      const entry = entryByKey.get(INTENT_CONFIG_KEYS[intent]);
      return row && entry
        ? [
            toDto(
              row,
              entry,
              resolvePlatformIntent(intent, indexRows, now)?.id ?? null
            ),
          ]
        : [];
    });
    return { intents, lastSyncAt: lastSeenAt?.toISOString() ?? null };
  }

  /**
   * Makes the confirmed previous model active again and the confirmed active one
   * previous, then answers the refreshed overview. A `pending` entry on the
   * restored model clears with it and its `resolution_pending` alert resolves;
   * any other pending entry stays. Rejects with
   * `ResolutionRollbackUnavailableError` unless the intent still holds both
   * confirmed models, and with `InvalidAIConfigError` when another intent
   * serves the previous one.
   */
  async rollback(
    selectorKey: PlatformSelectorKey,
    confirmed: RollbackResolutionInput,
    actorId: string
  ): Promise<PlatformResolutionsDto> {
    // Refreshed before the clash check: a sibling intent activated on another
    // instance would otherwise stay invisible until the cache's next interval.
    await this.resolutionCache.refresh();
    await this.config.assertNotServedByAnotherIntent(
      confirmed.previousModelId,
      intentOfSelectorKey(selectorKey)
    );
    const applied = await this.resolutions.rollback(
      selectorKey,
      confirmed,
      new Date()
    );
    if (applied === null) {
      throw new ResolutionRollbackUnavailableError(
        `'${selectorKey}' changed since it was loaded; reload and try again`
      );
    }
    await this.audit.record({
      actorId,
      action: 'ai_resolution.rolled_back',
      targetType: 'ai_model_resolution',
      targetId: selectorKey,
      before: { active: confirmed.activeModelId },
      after: { active: confirmed.previousModelId },
    });
    this.logger.log({
      event: 'ai.model.resolution_rolled_back',
      selectorKey,
      modelId: confirmed.previousModelId,
      previousModelId: confirmed.activeModelId,
      actorId,
    });
    if (applied.clearedPending) {
      await this.alerts.resolvePending(confirmed.previousModelId);
    }
    await this.resolutionCache.refresh();
    return this.overview();
  }
}

function pinOf(entry: AIConfigEntry): string | null {
  const pin =
    entry.storedValue ?? (entry.source === 'custom' ? entry.value : '');
  return pin === '' ? null : pin;
}

function toDto(
  row: ModelResolution,
  entry: AIConfigEntry,
  candidateModelId: string | null
): PlatformResolutionDto {
  return {
    intent: intentOfSelectorKey(row.selectorKey),
    selectorKey: row.selectorKey,
    configKey: entry.key,
    pin: pinOf(entry),
    served: entry.value,
    activeModelId: row.activeModelId,
    changedAt: row.changedAt?.toISOString() ?? null,
    previousModelId: row.previousModelId,
    releasedModelId: row.releasedModelId,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    pendingModelId: row.pendingModelId,
    gateStatus: row.gateStatus,
    gateDetail: row.gateDetail,
    gateRunUrl: row.gateRunUrl,
    candidateModelId,
  };
}
