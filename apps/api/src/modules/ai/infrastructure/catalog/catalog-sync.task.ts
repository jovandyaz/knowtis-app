import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import {
  isCatalogCandidate,
  toCandidateUpsert,
} from '../../domain/model-catalog/candidate-filter';
import {
  findLiteLlmDrift,
  findOpenRouterDrift,
  type DriftFinding,
} from '../../domain/model-catalog/curated-watch';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';
import {
  OPENROUTER_MODELS_CLIENT,
  type OpenRouterModelsClient,
  type UpstreamModel,
} from '../../domain/ports/openrouter-models.port';
import { LiteLlmPricesHttpClient } from './litellm-prices.client';

const ADVISORY_LOCK_KEY = 778_493_003;
const FAILURE_LOG_SAMPLE_SIZE = 10;

interface WriteFailure {
  target: string;
  reason: string;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class CatalogSyncTask {
  private readonly logger = new Logger(CatalogSyncTask.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly flags: FeatureFlagsService,
    @Inject(AI_CATALOG_REPOSITORY) private readonly repo: AiCatalogRepository,
    @Inject(OPENROUTER_MODELS_CLIENT)
    private readonly openRouter: OpenRouterModelsClient,
    private readonly liteLlm: LiteLlmPricesHttpClient,
    @Inject(MODEL_CATALOG) private readonly catalog: ModelCatalog
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sync(): Promise<void> {
    if (!(await this.flags.isEnabled(FEATURE_FLAG_KEYS.AI_CATALOG_SYNC))) {
      return;
    }
    try {
      const upstream = await this.openRouter.fetchModels();
      const findings = [
        ...findOpenRouterDrift(this.vendoredOutputCost, upstream),
        ...(await this.liteLlmFindings()),
      ];
      await this.persist(upstream, findings);
    } catch (error) {
      this.logger.error({
        event: 'ai.catalog.sync_failed',
        reason: reasonOf(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private readonly vendoredOutputCost = (modelId: string): number | undefined =>
    this.catalog.getPricing(modelId)?.outputCostPerToken;

  private async liteLlmFindings(): Promise<DriftFinding[]> {
    try {
      return findLiteLlmDrift(
        this.vendoredOutputCost,
        await this.liteLlm.fetchPrices()
      );
    } catch (error) {
      this.logger.warn({
        event: 'ai.catalog.litellm_fetch_failed',
        reason: reasonOf(error),
      });
      return [];
    }
  }

  private async persist(
    upstream: UpstreamModel[],
    findings: DriftFinding[]
  ): Promise<void> {
    await this.runLocked(async () => {
      const failures: WriteFailure[] = [];
      let candidates = 0;
      let alerts = 0;

      for (const model of upstream) {
        if (!isCatalogCandidate(model)) {
          continue;
        }
        try {
          await this.repo.upsertCandidate(toCandidateUpsert(model));
          candidates += 1;
        } catch (error) {
          failures.push({ target: model.id, reason: reasonOf(error) });
        }
      }

      for (const finding of findings) {
        try {
          await this.repo.createAlert(
            finding.modelId,
            finding.kind,
            finding.detail
          );
          alerts += 1;
        } catch (error) {
          failures.push({
            target: `${finding.modelId} ${finding.kind}`,
            reason: reasonOf(error),
          });
        }
      }

      this.logger.log({
        event: 'ai.catalog.sync',
        upstream: upstream.length,
        candidates,
        alerts,
      });
      if (failures.length > 0) {
        this.logger.warn({
          event: 'ai.catalog.sync_write_failed',
          count: failures.length,
          failures: failures.slice(0, FAILURE_LOG_SAMPLE_SIZE),
        });
      }
    });
  }

  /**
   * Runs `work` under a transaction-scoped advisory lock, which Postgres drops
   * on commit — a crashed run can never strand it the way a session lock taken
   * through a pool can. The writes inside `work` go through the pooled
   * repository, so the transaction bounds the lock, not their atomicity.
   */
  private async runLocked(work: () => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = (await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) AS locked`
      )) as unknown as { locked: boolean }[];
      if (rows[0]?.locked !== true) {
        this.logger.log({
          event: 'ai.catalog.sync_skipped',
          reason: 'another run holds the lock',
        });
        return;
      }
      await work();
    });
  }
}
