import { Inject, Injectable } from '@nestjs/common';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';
import {
  MODEL_INTENTS,
  type PlatformResolutionDto,
  type PlatformResolutionsDto,
  type PlatformSelectorKey,
} from '@knowtis/shared-types';

import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { ResolutionRollbackUnavailableError } from '../../domain/errors/resolution-rollback-unavailable.error';
import { resolvePlatformIntent } from '../../domain/model-catalog/model-selectors';
import {
  intentOfSelectorKey,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';
import { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
import { PlatformResolutionCache } from '../../infrastructure/catalog/platform-resolution.cache';
import {
  AIConfigService,
  INTENT_CONFIG_KEYS,
  type AIConfigEntry,
} from './ai-config.service';

/** What the backoffice shows per platform intent, and its roll back. Mirrors `/internal/model-gate/active`: a supported pin serves, otherwise the active resolution does. */
@Injectable()
export class PlatformResolutionsAdminService {
  constructor(
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly resolutions: ModelResolutionRepository,
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly indexRepository: ModelIndexRepository,
    private readonly config: AIConfigService,
    private readonly index: ModelIndexCache,
    private readonly resolutionCache: PlatformResolutionCache,
    private readonly audit: AdminAuditService
  ) {}

  async overview(): Promise<PlatformResolutionsDto> {
    const [rows, entries, lastSeenAt] = await Promise.all([
      this.resolutions.list(),
      this.config.getEffectiveConfig(),
      this.indexRepository.lastSeenAt(OPENROUTER_PROVIDER),
    ]);
    const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
    const now = new Date();
    const indexRows = this.index.catalog().all();
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
   * Makes the intent's previous model active again and the active one previous,
   * leaving its pending entry alone, then answers the refreshed overview.
   * Rejects with `ResolutionRollbackUnavailableError` when there is no previous
   * model or the active one changed since it was read, and with
   * `InvalidAIConfigError` when another intent serves the previous model.
   */
  async rollback(
    selectorKey: PlatformSelectorKey,
    actorId: string
  ): Promise<PlatformResolutionsDto> {
    // Refreshed before the clash check: a sibling intent activated on another
    // instance would otherwise stay invisible until the cache's next interval.
    const [rows] = await Promise.all([
      this.resolutions.list(),
      this.resolutionCache.refresh(),
    ]);
    const row = rows.find((read) => read.selectorKey === selectorKey);
    const previous = row?.previousModelId ?? null;
    if (!row || previous === null) {
      throw new ResolutionRollbackUnavailableError(
        `'${selectorKey}' has no previous model to roll back to`
      );
    }
    await this.config.assertNotServedByAnotherIntent(
      previous,
      intentOfSelectorKey(selectorKey)
    );
    const rolledBack = await this.resolutions.rollback(
      selectorKey,
      row.activeModelId,
      new Date()
    );
    if (!rolledBack) {
      throw new ResolutionRollbackUnavailableError(
        `'${selectorKey}' changed while rolling back; reload and try again`
      );
    }
    await this.audit.record({
      actorId,
      action: 'ai_resolution.rolled_back',
      targetType: 'ai_model_resolution',
      targetId: selectorKey,
      before: { active: row.activeModelId },
      after: { active: previous },
    });
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
