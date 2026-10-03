import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  fromOpenRouter,
  MODELS_DEV_PROVIDERS,
  type IndexedModel,
  type IndexProvider,
} from '@knowtis/ai-gateway';

import { AI_MODEL_INDEX_MAX_LENGTHS } from '../../../../database/schema/ai-model-index.schema';
import { canConcludeAbsence } from '../../domain/model-catalog/curated-watch';
import {
  planIndexSync,
  type IndexSyncPlan,
  type ProviderBatch,
  type SyncRejection,
} from '../../domain/model-catalog/index-sync-plan';
import { OPENROUTER_ID_PREFIX } from '../../domain/model-catalog/selectable-models.catalog';
import { servedIndexRows } from '../../domain/model-catalog/served-index-rows';
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

function fitsColumns(row: IndexedModel): boolean {
  return (
    row.id.length <= AI_MODEL_INDEX_MAX_LENGTHS.id &&
    row.name.length <= AI_MODEL_INDEX_MAX_LENGTHS.name &&
    (row.family?.length ?? 0) <= AI_MODEL_INDEX_MAX_LENGTHS.family &&
    row.canonical.length <= AI_MODEL_INDEX_MAX_LENGTHS.canonical
  );
}

function idsOf(
  rows: readonly IndexedModel[],
  provider: IndexProvider
): string[] {
  return rows.filter((row) => row.provider === provider).map((row) => row.id);
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
   * Upserts the rows both reads produced, then marks absent the rows of each
   * provider whose batch may conclude absence, except the ids upstream
   * published but the read discarded. A batch that would leave unserved a floor
   * model its provider serves now is written not at all, and a row a column
   * cannot hold is skipped and kept from absence. A `null` models.dev
   * read (its fetch failed) leaves the providers it serves untouched. Rejects
   * when a repository call fails.
   */
  async write(
    openRouter: UpstreamCatalog,
    modelsDev: ModelsDevCatalog | null
  ): Promise<ModelIndexWriteResult> {
    const batches = providerBatches(openRouter, modelsDev);
    const previousListed = await this.repo.countListedByProvider();
    const served = servedIndexRows(await this.repo.listListed());
    const plan = planIndexSync(batches, previousListed, served);
    const batchOf = new Map(batches.map((batch) => [batch.provider, batch]));

    for (const rejection of plan.rejected) {
      this.logRejection(
        rejection,
        batchOf.get(rejection.provider)?.rows.length ?? 0,
        previousListed[rejection.provider]
      );
    }

    const upserts = plan.upserts.filter(fitsColumns);
    const skipped = plan.upserts.filter((row) => !fitsColumns(row));
    if (skipped.length > 0) {
      this.logger.warn({
        event: 'ai.model_index.rows_skipped',
        count: skipped.length,
        models: skipped.slice(0, DISCARD_LOG_SAMPLE_SIZE).map((row) => row.id),
      });
    }

    const seenAt = new Date();
    const indexed = await this.repo.upsertMany(upserts, seenAt);
    let absent = 0;
    for (const provider of plan.concludeAbsence) {
      const retired = await this.repo.markAbsent(provider, seenAt, [
        ...(batchOf.get(provider)?.discarded ?? []),
        ...idsOf(skipped, provider),
      ]);
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

  private logRejection(
    rejection: SyncRejection,
    rows: number,
    previous: number
  ): void {
    const entry = {
      event: 'ai.model_index.sync_rejected',
      provider: rejection.provider,
      reason: rejection.reason,
      rows,
      previous,
    };
    if (rejection.reason === 'floor') {
      this.logger.error({ ...entry, models: rejection.models });
      return;
    }
    this.logger.warn(entry);
  }
}
