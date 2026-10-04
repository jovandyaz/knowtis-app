import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  fromOpenRouter,
  MAX_INT32,
  MODELS_DEV_PROVIDERS,
  type IndexedModel,
  type ModelsDevEnrichment,
} from '@knowtis/ai-gateway';

import {
  AI_MODEL_INDEX_COST_CEILING,
  AI_MODEL_INDEX_MAX_LENGTHS,
} from '../../../../database/schema/ai-model-index.schema';
import { OPENROUTER_ID_PREFIX } from '../../domain/model-catalog/catalog-model';
import {
  planIndexSync,
  type IndexSyncPlan,
  type ProviderBatch,
  type SyncRejection,
} from '../../domain/model-catalog/index-sync-plan';
import { canConcludeAbsence } from '../../domain/model-catalog/openrouter-watch';
import { servedIndexRows } from '../../domain/model-catalog/served-index-rows';
import { DISCARD_LOG_SAMPLE_SIZE } from '../../domain/model-catalog/upstream-discards';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import type { ModelsDevCatalog } from '../../domain/ports/models-dev.port';
import type { UpstreamCatalog } from '../../domain/ports/openrouter-models.port';
import { WebhookAlertService } from '../alerting/webhook-alert.service';

export interface ModelIndexWriteResult {
  /** Distinct rows upserted. */
  readonly indexed: number;
  /** Rows newly marked absent. */
  readonly absent: number;
  readonly rejected: IndexSyncPlan['rejected'];
}

function carried(row: IndexedModel | undefined): ModelsDevEnrichment | null {
  return row === undefined
    ? null
    : {
        family: row.family,
        canonical: row.canonical,
        openWeights: row.openWeights,
        status: row.status,
      };
}

/**
 * The index rows one sync pass reads, per provider. A `null` models.dev read
 * yields only the OpenRouter batch. An OpenRouter model models.dev has no
 * entry for keeps the family, canonical, open-weights and status of its
 * `previous` row.
 */
export function providerBatches(
  openRouter: UpstreamCatalog,
  modelsDev: ModelsDevCatalog | null,
  previous: readonly IndexedModel[] = []
): ProviderBatch[] {
  const previousById = new Map(previous.map((row) => [row.id, row]));
  const openRouterBatch: ProviderBatch = {
    provider: 'openrouter',
    rows: openRouter.models.map((model) =>
      fromOpenRouter(
        model,
        modelsDev?.openRouterEnrichment.get(model.id) ??
          carried(previousById.get(`${OPENROUTER_ID_PREFIX}${model.id}`))
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

function fitsTokenColumn(limit: number | null): boolean {
  return limit === null || (Number.isInteger(limit) && limit <= MAX_INT32);
}

function fitsCostColumn(cost: number | null): boolean {
  return cost === null || cost < AI_MODEL_INDEX_COST_CEILING;
}

function fitsColumns(row: IndexedModel): boolean {
  return (
    row.id.length <= AI_MODEL_INDEX_MAX_LENGTHS.id &&
    row.name.length <= AI_MODEL_INDEX_MAX_LENGTHS.name &&
    (row.family?.length ?? 0) <= AI_MODEL_INDEX_MAX_LENGTHS.family &&
    row.canonical.length <= AI_MODEL_INDEX_MAX_LENGTHS.canonical &&
    fitsTokenColumn(row.maxInputTokens) &&
    fitsTokenColumn(row.maxOutputTokens) &&
    fitsCostColumn(row.inputCostPerToken) &&
    fitsCostColumn(row.outputCostPerToken) &&
    fitsCostColumn(row.cacheReadCostPerToken) &&
    fitsCostColumn(row.cacheWriteCostPerToken)
  );
}

/** Writes one sync pass into the model index. */
@Injectable()
export class ModelIndexWriter {
  private readonly logger = new Logger(ModelIndexWriter.name);

  constructor(
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly repo: ModelIndexRepository,
    private readonly alerts: WebhookAlertService
  ) {}

  /**
   * Upserts the rows both reads produced, then marks absent the rows of each
   * provider whose batch may conclude absence, except the ids upstream
   * published but the read discarded. A row a column cannot hold is skipped
   * and kept from absence the same way. A batch that would leave unserved a
   * floor model its provider serves now is written not at all, and raises a
   * `model_index.floor_rejected` alert naming what it would leave unserved. A
   * `null` models.dev read (its fetch failed) leaves the providers it serves
   * untouched. Rejects when a repository call fails.
   */
  async write(
    openRouter: UpstreamCatalog,
    modelsDev: ModelsDevCatalog | null
  ): Promise<ModelIndexWriteResult> {
    const listed = await this.repo.listListed();
    const served = servedIndexRows(listed);
    const batches = providerBatches(openRouter, modelsDev, served).map(
      (batch) => this.withoutOverflowingRows(batch)
    );
    const plan = planIndexSync(batches, listed, served);
    const batchOf = new Map(batches.map((batch) => [batch.provider, batch]));

    for (const rejection of plan.rejected) {
      this.reportRejection(
        rejection,
        batchOf.get(rejection.provider)?.rows.length ?? 0,
        listed.filter((row) => row.provider === rejection.provider).length
      );
    }

    const seenAt = new Date();
    const indexed = await this.repo.upsertMany(plan.upserts, seenAt);
    let absent = 0;
    for (const provider of plan.concludeAbsence) {
      const retired = await this.repo.markAbsent(
        provider,
        seenAt,
        batchOf.get(provider)?.discarded ?? []
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

  /** Moves the rows a column cannot hold from `rows` to `discarded`, so they are neither written nor concluded absent. */
  private withoutOverflowingRows(batch: ProviderBatch): ProviderBatch {
    const skipped = batch.rows
      .filter((row) => !fitsColumns(row))
      .map((row) => row.id);
    if (skipped.length === 0) {
      return batch;
    }
    this.logger.warn({
      event: 'ai.model_index.rows_skipped',
      provider: batch.provider,
      count: skipped.length,
      models: skipped.slice(0, DISCARD_LOG_SAMPLE_SIZE),
    });
    return {
      ...batch,
      rows: batch.rows.filter(fitsColumns),
      discarded: [...batch.discarded, ...skipped],
    };
  }

  private reportRejection(
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
      this.alerts.notify('model_index.floor_rejected', {
        provider: rejection.provider,
        models: rejection.models,
      });
      return;
    }
    this.logger.warn(entry);
  }
}
