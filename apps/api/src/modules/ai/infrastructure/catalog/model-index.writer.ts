import { Inject, Injectable, Logger } from '@nestjs/common';

import { fromOpenRouter, MODELS_DEV_PROVIDERS } from '@knowtis/ai-gateway';

import { canConcludeAbsence } from '../../domain/model-catalog/curated-watch';
import {
  planIndexSync,
  type IndexSyncPlan,
  type ProviderBatch,
} from '../../domain/model-catalog/index-sync-plan';
import { OPENROUTER_ID_PREFIX } from '../../domain/model-catalog/selectable-models.catalog';
import { DISCARD_LOG_SAMPLE_SIZE } from '../../domain/model-catalog/upstream-discards';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import type { ModelsDevCatalog } from '../../domain/ports/models-dev.port';
import type { UpstreamCatalog } from '../../domain/ports/openrouter-models.port';

export interface ModelIndexWriteResult {
  /** Distinct rows upserted. */
  readonly indexed: number;
  /** Rows newly marked absent. */
  readonly absent: number;
  readonly rejected: IndexSyncPlan['rejected'];
}

/** The index rows one sync pass reads, per provider. A `null` models.dev read yields only the OpenRouter batch. */
export function providerBatches(
  openRouter: UpstreamCatalog,
  modelsDev: ModelsDevCatalog | null
): ProviderBatch[] {
  const openRouterBatch: ProviderBatch = {
    provider: 'openrouter',
    rows: openRouter.models.map((model) =>
      fromOpenRouter(
        model,
        modelsDev?.openRouterEnrichment.get(model.id) ?? null
      )
    ),
    conclusive: canConcludeAbsence(openRouter),
    discarded: openRouter.discarded.map((id) => `${OPENROUTER_ID_PREFIX}${id}`),
  };
  if (modelsDev === null) {
    return [openRouterBatch];
  }
  const conclusive = modelsDev.discarded.length === 0;
  return [
    ...MODELS_DEV_PROVIDERS.map((provider) => ({
      provider,
      rows: modelsDev.models.filter((model) => model.provider === provider),
      conclusive,
      discarded: modelsDev.discarded.filter((id) =>
        id.startsWith(`${provider}:`)
      ),
    })),
    openRouterBatch,
  ];
}

/** Writes one sync pass into the model index. */
@Injectable()
export class ModelIndexWriter {
  private readonly logger = new Logger(ModelIndexWriter.name);

  constructor(
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly repo: ModelIndexRepository
  ) {}

  /**
   * Upserts every row both reads produced, then marks absent the rows of each
   * provider whose batch may conclude absence, except the ids upstream
   * published but the read discarded. A `null` models.dev read (its
   * fetch failed) leaves the providers it serves untouched. Rejects when a
   * repository call fails.
   */
  async write(
    openRouter: UpstreamCatalog,
    modelsDev: ModelsDevCatalog | null
  ): Promise<ModelIndexWriteResult> {
    const batches = providerBatches(openRouter, modelsDev);
    const previousListed = await this.repo.countListedByProvider();
    const plan = planIndexSync(batches, previousListed);

    const rejectionOf = new Map(
      plan.rejected.map(({ provider, reason }) => [provider, reason])
    );
    for (const { provider, rows } of batches) {
      const reason = rejectionOf.get(provider);
      if (reason === undefined) {
        continue;
      }
      this.logger.warn({
        event: 'ai.model_index.sync_rejected',
        provider,
        reason,
        rows: rows.length,
        previous: previousListed[provider],
      });
    }

    const discardedOf = new Map(
      batches.map(({ provider, discarded }) => [provider, discarded])
    );
    const seenAt = new Date();
    const indexed = await this.repo.upsertMany(plan.upserts, seenAt);
    let absent = 0;
    for (const provider of plan.concludeAbsence) {
      const retired = await this.repo.markAbsent(
        provider,
        seenAt,
        discardedOf.get(provider) ?? []
      );
      absent += retired.length;
      if (retired.length > 0) {
        this.logger.log({
          event: 'ai.model_index.marked_absent',
          provider,
          count: retired.length,
          models: retired.slice(0, DISCARD_LOG_SAMPLE_SIZE),
        });
      }
    }

    this.logger.log({ event: 'ai.model_index.sync', indexed, absent });
    return { indexed, absent, rejected: plan.rejected };
  }
}
