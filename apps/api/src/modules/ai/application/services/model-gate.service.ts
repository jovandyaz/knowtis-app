import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
  CATALOG_ALERT_DETAIL_MAX_LENGTH,
  type CatalogAlertKind,
  type ModelGatePendingDto,
  type ModelGateVerdictResultDto,
  type ModelIntent,
  type PlatformSelectorKey,
} from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import type { WatchFinding } from '../../domain/model-catalog/model-watch';
import {
  intentOfSelectorKey,
  PENDING_GATE_STATUS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';
import { CatalogAlertsWriter } from '../../infrastructure/catalog/catalog-alerts.writer';
import { PlatformResolutionCache } from '../../infrastructure/catalog/platform-resolution.cache';
import { AIConfigService } from './ai-config.service';

const DEFAULT_GATE_FAILURE_DETAIL = 'eval gate failed';
const RESOLUTION_PENDING = 'resolution_pending' satisfies CatalogAlertKind;

export interface VerdictInput {
  readonly selectorKey: PlatformSelectorKey;
  readonly modelId: string;
  readonly passed: boolean;
  readonly runUrl: string;
  readonly detail?: string;
}

const APPLIED: ModelGateVerdictResultDto = { applied: true };
const NOT_PENDING: ModelGateVerdictResultDto = {
  applied: false,
  reason: 'not_pending',
};
const CONFLICT: ModelGateVerdictResultDto = {
  applied: false,
  reason: 'conflict',
};

function gatePendingModelOf(row: ModelResolution): string | null {
  return row.gateStatus === PENDING_GATE_STATUS ? row.pendingModelId : null;
}

function failureDetail(detail: string | undefined): string {
  return (detail?.trim() || DEFAULT_GATE_FAILURE_DETAIL).slice(
    0,
    AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH
  );
}

// The reason goes last, so a detail cut to fit loses only its tail.
function gateFailed(
  { selectorKey, modelId, runUrl }: VerdictInput,
  reason: string
): WatchFinding {
  return {
    subject: modelId,
    kind: 'gate_failed',
    detail: `${selectorKey} (${runUrl}): ${reason}`.slice(
      0,
      CATALOG_ALERT_DETAIL_MAX_LENGTH
    ),
  };
}

/** The eval gate's side of the platform resolutions: what awaits a verdict, what production serves, and applying a verdict. */
@Injectable()
export class ModelGateService {
  private readonly logger = new Logger(ModelGateService.name);

  constructor(
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly repository: ModelResolutionRepository,
    private readonly resolutions: PlatformResolutionCache,
    private readonly config: AIConfigService,
    private readonly alerts: CatalogAlertsWriter
  ) {}

  /** The selectors whose pending model awaits a verdict; a failed one is not listed again. */
  async pending(): Promise<ModelGatePendingDto[]> {
    const rows = await this.repository.list();
    return rows.flatMap((row) => {
      const modelId = gatePendingModelOf(row);
      return modelId === null
        ? []
        : [{ selectorKey: row.selectorKey, modelId }];
    });
  }

  /** The model each intent serves in production: its supported pin, else its active resolution. */
  active(): Promise<Readonly<Record<ModelIntent, string>>> {
    return this.config.getIntentModels();
  }

  /** Applies a verdict to the selector's pending model. A pass is not activated while another intent serves that model; a verdict for a model no longer pending changes nothing. A recorded failure and a refused activation raise `gate_failed`; an applied verdict resolves the model's open `resolution_pending` alert. */
  verdict(input: VerdictInput): Promise<ModelGateVerdictResultDto> {
    return input.passed ? this.onPassed(input) : this.onFailed(input);
  }

  // Refreshed before the clash check: a sibling intent activated on another
  // instance would otherwise stay invisible until the cache's next interval.
  private async onPassed(
    input: VerdictInput
  ): Promise<ModelGateVerdictResultDto> {
    const { selectorKey, modelId, runUrl } = input;
    const [rows] = await Promise.all([
      this.repository.list(),
      this.resolutions.refresh(),
    ]);
    const row = rows.find((read) => read.selectorKey === selectorKey);
    if (!row || gatePendingModelOf(row) !== modelId) {
      return NOT_PENDING;
    }
    const servedBy = await this.config.intentServing(
      modelId,
      intentOfSelectorKey(selectorKey)
    );
    if (servedBy !== null) {
      return this.onConflict(input, servedBy);
    }
    const applied = await this.repository.recordVerdict(
      selectorKey,
      modelId,
      { passed: true, runUrl },
      new Date()
    );
    if (!applied) {
      return NOT_PENDING;
    }
    await this.resolutions.refresh();
    this.logger.log({
      event: 'ai.model.resolution_activated',
      selectorKey,
      modelId,
      previousModelId: row.activeModelId,
    });
    await this.resolvePendingAlert(modelId);
    return APPLIED;
  }

  private async onFailed(
    input: VerdictInput
  ): Promise<ModelGateVerdictResultDto> {
    const { selectorKey, modelId, runUrl, detail } = input;
    const failure = failureDetail(detail);
    const applied = await this.repository.recordVerdict(
      selectorKey,
      modelId,
      { passed: false, runUrl, detail: failure },
      new Date()
    );
    if (!applied) {
      return NOT_PENDING;
    }
    await this.alerts.raise([gateFailed(input, failure)]);
    await this.resolvePendingAlert(modelId);
    return APPLIED;
  }

  private async onConflict(
    input: VerdictInput,
    servedBy: ModelIntent
  ): Promise<ModelGateVerdictResultDto> {
    this.logger.warn({
      event: 'ai.model_resolution.activation_conflict',
      selectorKey: input.selectorKey,
      modelId: input.modelId,
      servedBy,
    });
    await this.alerts.raise([gateFailed(input, `serves ${servedBy} already`)]);
    return CONFLICT;
  }

  private async resolvePendingAlert(modelId: string): Promise<void> {
    try {
      await this.alerts.resolveOpen(modelId, RESOLUTION_PENDING);
    } catch (error) {
      this.logger.warn({
        event: 'ai.catalog.alert_resolve_failed',
        subject: modelId,
        kind: RESOLUTION_PENDING,
        reason: reasonOf(error),
      });
    }
  }
}
