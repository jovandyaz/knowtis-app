import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Sql } from 'postgres';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';
import {
  PROMOTED_STATUS,
  type CatalogSyncResultDto,
  type CatalogSyncSkipReason,
} from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import { stackOf } from '../../../../core/errors/stack-of';
import { DATABASE_CLIENT, runWithAdvisoryLock } from '../../../../database';
import {
  isCatalogCandidate,
  toCandidateUpsert,
} from '../../domain/model-catalog/candidate-filter';
import {
  canConcludeAbsence,
  findOpenRouterDrift,
  findPromotedDrift,
  type DriftFinding,
} from '../../domain/model-catalog/openrouter-watch';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';
import {
  MODELS_DEV_CLIENT,
  type ModelsDevCatalog,
  type ModelsDevClient,
} from '../../domain/ports/models-dev.port';
import {
  OPENROUTER_MODELS_CLIENT,
  type OpenRouterModelsClient,
  type UpstreamCatalog,
  type UpstreamModel,
} from '../../domain/ports/openrouter-models.port';
import {
  PLATFORM_MODELS_SOURCE,
  type PlatformModelsSource,
} from '../../domain/ports/platform-models.port';
import { ModelIndexWriter } from './model-index.writer';
import { PlatformCandidatesWriter } from './platform-candidates.writer';

const ADVISORY_LOCK_KEY = 778_493_003;
const FAILURE_LOG_SAMPLE_SIZE = 10;

interface WriteFailure {
  target: string;
  reason: string;
}

type OpenRouterRead =
  | { ok: true; catalog: UpstreamCatalog }
  | { ok: false; error: unknown };

function skipped(reason: CatalogSyncSkipReason): CatalogSyncResultDto {
  return {
    status: 'skipped',
    skippedReason: reason,
    upstream: 0,
    candidates: 0,
    indexed: 0,
    alerts: 0,
    failures: 0,
  };
}

@Injectable()
export class CatalogSyncTask {
  private readonly logger = new Logger(CatalogSyncTask.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly client: Sql,
    @Inject(AI_CATALOG_REPOSITORY) private readonly repo: AiCatalogRepository,
    @Inject(OPENROUTER_MODELS_CLIENT)
    private readonly openRouter: OpenRouterModelsClient,
    @Inject(MODELS_DEV_CLIENT) private readonly modelsDev: ModelsDevClient,
    private readonly indexWriter: ModelIndexWriter,
    @Inject(PLATFORM_MODELS_SOURCE)
    private readonly platformModels: PlatformModelsSource,
    private readonly candidates: PlatformCandidatesWriter
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sync(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error({
        event: 'ai.catalog.sync_failed',
        reason: reasonOf(error),
        stack: stackOf(error),
      });
    }
  }

  /**
   * Runs one pass and resolves what it did. Rejects when the OpenRouter fetch fails, after indexing the models.dev read alone — the cron swallows that, an on-demand caller surfaces it.
   */
  async run(): Promise<CatalogSyncResultDto> {
    const outcome = await runWithAdvisoryLock(
      this.client,
      ADVISORY_LOCK_KEY,
      () => this.fetchAndPersist()
    );
    if (!outcome.acquired) {
      this.logger.log({
        event: 'ai.catalog.sync_skipped',
        reason: 'another run holds the lock',
      });
      return skipped('locked');
    }
    return outcome.result;
  }

  private async promotedFindings(
    catalog: UpstreamCatalog,
    watched: readonly string[]
  ): Promise<DriftFinding[]> {
    try {
      const promoted = await this.repo.listByStatus(PROMOTED_STATUS);
      return findPromotedDrift(
        promoted.map((model) => model.id),
        catalog,
        watched
      );
    } catch (error) {
      this.logger.warn({
        event: 'ai.catalog.promoted_read_failed',
        reason: reasonOf(error),
      });
      return [];
    }
  }

  private async openRouterCatalog(): Promise<OpenRouterRead> {
    try {
      return { ok: true, catalog: await this.openRouter.fetchModels() };
    } catch (error) {
      return { ok: false, error };
    }
  }

  /** Never rejects: an unreadable config watches no platform model this pass. */
  private async watchedModelIds(): Promise<string[]> {
    try {
      return await this.platformModels.getPlatformModelIds();
    } catch (error) {
      this.logger.warn({
        event: 'ai.catalog.platform_models_read_failed',
        reason: reasonOf(error),
      });
      return [];
    }
  }

  private async modelsDevCatalog(): Promise<ModelsDevCatalog | null> {
    try {
      return await this.modelsDev.fetchCatalog();
    } catch (error) {
      this.logger.warn({
        event: 'ai.model_index.models_dev_fetch_failed',
        reason: reasonOf(error),
      });
      return null;
    }
  }

  private async writeIndex(
    openRouter: UpstreamCatalog | null,
    modelsDev: ModelsDevCatalog | null
  ): Promise<number> {
    if (openRouter === null && modelsDev === null) {
      return 0;
    }
    try {
      const { indexed, concluded } = await this.indexWriter.write(
        openRouter,
        modelsDev
      );
      if (concluded.includes(OPENROUTER_PROVIDER)) {
        await this.pendCandidates();
      }
      return indexed;
    } catch (error) {
      this.logger.error({
        event: 'ai.model_index.write_failed',
        reason: reasonOf(error),
        stack: stackOf(error),
      });
      return 0;
    }
  }

  /** Never rejects: a failed write leaves the resolutions as they were until the next sync. */
  private async pendCandidates(): Promise<void> {
    try {
      await this.candidates.write(new Date());
    } catch (error) {
      this.logger.warn({
        event: 'ai.model_resolution.pending_failed',
        reason: reasonOf(error),
      });
    }
  }

  private async fetchAndPersist(): Promise<CatalogSyncResultDto> {
    const [openRouter, modelsDev] = await Promise.all([
      this.openRouterCatalog(),
      this.modelsDevCatalog(),
    ]);
    if (!openRouter.ok) {
      await this.writeIndex(null, modelsDev);
      throw openRouter.error;
    }
    const catalog = openRouter.catalog;
    // A blind run logs the same `alerts: 0` as a healthy one, so the operator
    // must be told the vanish watch concluded nothing this pass.
    if (!canConcludeAbsence(catalog)) {
      this.logger.warn({
        event: 'ai.catalog.absence_watch_blind',
        complete: catalog.complete,
        models: catalog.models.length,
        discarded: catalog.discarded.length,
      });
    }
    const indexed = await this.writeIndex(catalog, modelsDev);
    const watched = await this.watchedModelIds();
    const findings = [
      ...findOpenRouterDrift(catalog, watched),
      ...(await this.promotedFindings(catalog, watched)),
    ];
    return this.persist(catalog.models, findings, indexed);
  }

  private async persist(
    upstream: readonly UpstreamModel[],
    findings: DriftFinding[],
    indexed: number
  ): Promise<CatalogSyncResultDto> {
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
        const opened = await this.repo.createAlert(
          finding.modelId,
          finding.kind,
          finding.detail
        );
        if (opened) {
          alerts += 1;
        }
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

    return {
      status: 'completed',
      skippedReason: null,
      upstream: upstream.length,
      candidates,
      indexed,
      alerts,
      failures: failures.length,
    };
  }
}
