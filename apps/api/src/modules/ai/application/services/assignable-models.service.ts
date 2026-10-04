import { Injectable } from '@nestjs/common';

import { INDEX_PROVIDERS, providerOf } from '@knowtis/ai-gateway';
import type { AssignableModelDto } from '@knowtis/shared-types';

import { toPickerLabel } from '../../domain/model-catalog/index-label';
import {
  ASSIGNABLE_RULE,
  byNewestRelease,
  intentOfFamily,
  isEligible,
} from '../../domain/model-catalog/model-selectors';
import { isoDateOf } from '../../domain/value-objects/utc-day';
import { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const DEFAULT_TIER = 'open';

interface AssignableEntry {
  readonly dto: AssignableModelDto;
  readonly releasedAt: string | null;
}

function providerRank(provider: string): number {
  const rank = INDEX_PROVIDERS.findIndex((known) => known === provider);
  return rank === -1 ? INDEX_PROVIDERS.length : rank;
}

function byDisplayOrder(a: AssignableEntry, b: AssignableEntry): number {
  const rank = providerRank(a.dto.provider) - providerRank(b.dto.provider);
  if (rank !== 0) {
    return rank;
  }
  const release = byNewestRelease(a, b);
  if (release !== 0) {
    return release;
  }
  return a.dto.id < b.dto.id ? -1 : a.dto.id > b.dto.id ? 1 : 0;
}

@Injectable()
export class AssignableModelsService {
  constructor(
    private readonly registry: ProviderRegistryFactory,
    private readonly promotedModels: PromotedModelsCache,
    private readonly index: ModelIndexCache
  ) {}

  /**
   * Every model an admin may assign as an intent default: the eligible index
   * rows of providers the server holds a key for, plus every promoted model. A
   * promoted id replaces its index entry, keeping its stored copy and tier.
   */
  async list(): Promise<AssignableModelDto[]> {
    const now = new Date();
    const entries = new Map<string, AssignableEntry>();
    const rows = this.index.catalog().all();
    for (const row of rows) {
      if (
        this.registry.isModelAvailable(row.id) &&
        isEligible(row, ASSIGNABLE_RULE, now)
      ) {
        entries.set(row.id, {
          releasedAt: row.releasedAt,
          dto: {
            id: row.id,
            label: toPickerLabel(row.name),
            description: '',
            tier: intentOfFamily(row.family) ?? DEFAULT_TIER,
            provider: row.provider,
            routableByServer: true,
            promoted: false,
          },
        });
      }
    }
    const releasedAtById = new Map(rows.map((row) => [row.id, row.releasedAt]));
    for (const model of this.promotedModels.snapshot()) {
      entries.set(model.id, {
        releasedAt:
          releasedAtById.get(model.id) ??
          (model.upstreamCreatedAt === null
            ? null
            : isoDateOf(model.upstreamCreatedAt)),
        dto: {
          id: model.id,
          label: model.label,
          description: model.description,
          tier: model.tier,
          provider: providerOf(model.id),
          // Promotion implies the server-keyed openrouter route, but the
          // registry stays the one source of truth for routability.
          routableByServer: this.registry.isModelAvailable(model.id),
          promoted: true,
        },
      });
    }
    return [...entries.values()].sort(byDisplayOrder).map((entry) => entry.dto);
  }
}
