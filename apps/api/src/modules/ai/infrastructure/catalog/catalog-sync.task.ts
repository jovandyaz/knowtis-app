import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Sql } from 'postgres';

import { OPENROUTER_PROVIDER, type IndexedModel } from '@knowtis/ai-gateway';
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
import type { SyncRejection } from '../../domain/model-catalog/index-sync-plan';
import {
  findFamilyDrift,
  findPinUnavailable,
  findRetirementScheduled,
  type WatchFinding,
} from '../../domain/model-catalog/model-watch';
import {
  canConcludeAbsence,
  findOpenRouterDrift,
  findPromotedDrift,
} from '../../domain/model-catalog/openrouter-watch';
import type { ModelResolution } from '../../domain/model-catalog/platform-resolution';
import { servedIndexRows } from '../../domain/model-catalog/served-index-rows';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';
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
  PINNED_MODELS_SOURCE,
  PLATFORM_MODELS_SOURCE,
  type PinnedModelsSource,
  type PlatformModelsSource,
} from '../../domain/ports/platform-models.port';
import { CatalogAlertsWriter } from './catalog-alerts.writer';
import { ModelIndexWriter } from './model-index.writer';
import { PlatformCandidatesWriter } from './platform-candidates.writer';

const ADVISORY_LOCK_KEY = 778_493_003;
const FAILURE_LOG_SAMPLE_SIZE = 10;

const SHRINK_REJECTION_DETAIL =
  'shrink: the batch lists too few of the rows the index holds, so it retired none';

interface WriteFailure {
  target: string;
  reason: string;
}

type OpenRouterRead =
  | { ok: true; catalog: UpstreamCatalog }
  | { ok: false; error: unknown };

interface IndexWrite {
  readonly indexed: number;
  readonly rejected: readonly SyncRejection[];
  readonly openRouterConcluded: boolean;
}

const NOTHING_WRITTEN: IndexWrite = {
  indexed: 0,
  rejected: [],
  openRouterConcluded: false,
};

/** The model ids each watch covers this pass; a read that failed contributes none. */
interface WatchedModels {
  /** Served, fallback and pending platform models: the OpenRouter absence watch. */
  readonly platform: readonly string[];
  readonly pinned: readonly string[];
  readonly resolutions: readonly ModelResolution[];
}

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

/** A `sync_rejected` finding for a shrink or floor rejection. An inconclusive batch is only logged: one discarded upstream row makes a batch inconclusive, which is routine. */
function syncRejected(rejection: SyncRejection): WatchFinding[] {
  if (rejection.reason === 'inconclusive') {
    return [];
  }
  return [
    {
      subject: rejection.provider,
      kind: 'sync_rejected',
      detail:
        rejection.reason === 'floor'
          ? `floor: the batch would leave ${rejection.models.join(', ')} unserved, so none of it was written`
          : SHRINK_REJECTION_DETAIL,
    },
  ];
}

function pendingModelIds(rows: readonly ModelResolution[]): string[] {
  return rows.flatMap((row) =>
    row.pendingModelId === null ? [] : [row.pendingModelId]
  );
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
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly index: ModelIndexRepository,
    @Inject(PLATFORM_MODELS_SOURCE)
    private readonly platformModels: PlatformModelsSource,
    @Inject(PINNED_MODELS_SOURCE)
    private readonly pinnedModels: PinnedModelsSource,
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly resolutions: ModelResolutionRepository,
    private readonly candidates: PlatformCandidatesWriter,
    private readonly alerts: CatalogAlertsWriter
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

  /** Never rejects: a failed read logs `event` and resolves `fallback`, so one unreadable source blinds only the watches that need it. */
  private async readOr<T>(
    read: () => Promise<T>,
    fallback: T,
    event: string
  ): Promise<T> {
    try {
      return await read();
    } catch (error) {
      this.logger.warn({ event, reason: reasonOf(error) });
      return fallback;
    }
  }

  private async promotedFindings(
    catalog: UpstreamCatalog,
    watched: readonly string[]
  ): Promise<WatchFinding[]> {
    const promoted = await this.readOr(
      () => this.repo.listByStatus(PROMOTED_STATUS),
      [],
      'ai.catalog.promoted_read_failed'
    );
    return findPromotedDrift(
      promoted.map((model) => model.id),
      catalog,
      watched
    );
  }

  private async openRouterCatalog(): Promise<OpenRouterRead> {
    try {
      return { ok: true, catalog: await this.openRouter.fetchModels() };
    } catch (error) {
      return { ok: false, error };
    }
  }

  private modelsDevCatalog(): Promise<ModelsDevCatalog | null> {
    return this.readOr(
      () => this.modelsDev.fetchCatalog(),
      null,
      'ai.model_index.models_dev_fetch_failed'
    );
  }

  /** Read after the index write and the candidates write, so each watch sees this pass's index rows and pending models. */
  private async watchedModels(): Promise<WatchedModels> {
    const [platform, pinned, resolutions] = await Promise.all([
      this.readOr(
        () => this.platformModels.getPlatformModelIds(),
        [],
        'ai.catalog.platform_models_read_failed'
      ),
      this.readOr(
        () => this.pinnedModels.getPinnedModelIds(),
        [],
        'ai.catalog.pinned_models_read_failed'
      ),
      this.readOr(
        () => this.resolutions.list(),
        [],
        'ai.catalog.resolutions_read_failed'
      ),
    ]);
    return {
      platform: [...platform, ...pendingModelIds(resolutions)],
      pinned,
      resolutions,
    };
  }

  private async indexFindings(
    watched: WatchedModels,
    openRouterConcluded: boolean
  ): Promise<WatchFinding[]> {
    const listed = await this.readOr<IndexedModel[] | null>(
      () => this.index.listListed(),
      null,
      'ai.catalog.index_read_failed'
    );
    if (listed === null) {
      return [];
    }
    const served = servedIndexRows(listed);
    return [
      ...findPinUnavailable(
        watched.pinned,
        new Set(served.map((row) => row.id))
      ),
      ...findRetirementScheduled(
        [...watched.platform, ...watched.pinned],
        served
      ),
      ...(openRouterConcluded
        ? findFamilyDrift(served, watched.resolutions, new Date())
        : []),
    ];
  }

  private async writeIndex(
    openRouter: UpstreamCatalog | null,
    modelsDev: ModelsDevCatalog | null
  ): Promise<IndexWrite> {
    if (openRouter === null && modelsDev === null) {
      return NOTHING_WRITTEN;
    }
    try {
      const { indexed, rejected, concluded } = await this.indexWriter.write(
        openRouter,
        modelsDev
      );
      const openRouterConcluded = concluded.includes(OPENROUTER_PROVIDER);
      if (openRouterConcluded) {
        await this.pendCandidates();
      }
      return { indexed, rejected, openRouterConcluded };
    } catch (error) {
      this.logger.error({
        event: 'ai.model_index.write_failed',
        reason: reasonOf(error),
        stack: stackOf(error),
      });
      return NOTHING_WRITTEN;
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
      const { rejected } = await this.writeIndex(null, modelsDev);
      await this.alerts.raise(rejected.flatMap(syncRejected));
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
    const write = await this.writeIndex(catalog, modelsDev);
    const watched = await this.watchedModels();
    const findings = [
      ...write.rejected.flatMap(syncRejected),
      ...findOpenRouterDrift(catalog, watched.platform),
      ...(await this.promotedFindings(catalog, watched.platform)),
      ...(await this.indexFindings(watched, write.openRouterConcluded)),
    ];
    return this.persist(catalog.models, findings, write.indexed);
  }

  private async persist(
    upstream: readonly UpstreamModel[],
    findings: readonly WatchFinding[],
    indexed: number
  ): Promise<CatalogSyncResultDto> {
    const failures: WriteFailure[] = [];
    let candidates = 0;

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

    const alerts = await this.alerts.raise(findings);

    this.logger.log({
      event: 'ai.catalog.sync',
      upstream: upstream.length,
      candidates,
      alerts: alerts.opened,
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
      alerts: alerts.opened,
      failures: failures.length + alerts.failed,
    };
  }
}
