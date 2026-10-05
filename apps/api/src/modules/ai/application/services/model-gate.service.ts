import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ModelIntent, PlatformSelectorKey } from '@knowtis/shared-types';

import { AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH } from '../../../../database/schema/ai-model-resolutions.schema';
import {
  intentOfSelectorKey,
  PENDING_GATE_STATUS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';
import { PlatformResolutionCache } from '../../infrastructure/catalog/platform-resolution.cache';
import { AIConfigService } from './ai-config.service';

const DEFAULT_GATE_FAILURE_DETAIL = 'eval gate failed';

export interface PendingGateEntry {
  readonly selectorKey: PlatformSelectorKey;
  readonly modelId: string;
}

export type VerdictOutcome =
  | { readonly applied: true }
  | { readonly applied: false; readonly reason: 'not_pending' | 'conflict' };

export interface VerdictInput {
  readonly selectorKey: PlatformSelectorKey;
  readonly modelId: string;
  readonly passed: boolean;
  readonly runUrl: string;
  readonly detail?: string;
}

const APPLIED: VerdictOutcome = { applied: true };
const NOT_PENDING: VerdictOutcome = { applied: false, reason: 'not_pending' };
const CONFLICT: VerdictOutcome = { applied: false, reason: 'conflict' };

function gatePendingModelOf(row: ModelResolution): string | null {
  return row.gateStatus === PENDING_GATE_STATUS ? row.pendingModelId : null;
}

function failureDetail(detail: string | undefined): string {
  return (detail?.trim() || DEFAULT_GATE_FAILURE_DETAIL).slice(
    0,
    AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH
  );
}

/** The eval gate's side of the platform resolutions: what awaits a verdict, what production serves, and applying a verdict. */
@Injectable()
export class ModelGateService {
  private readonly logger = new Logger(ModelGateService.name);

  constructor(
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly repository: ModelResolutionRepository,
    private readonly resolutions: PlatformResolutionCache,
    private readonly config: AIConfigService
  ) {}

  /** The selectors whose pending model awaits a verdict; a failed one is not listed again. */
  async pending(): Promise<PendingGateEntry[]> {
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

  /** Applies a verdict to the selector's pending model. A pass is not activated while another intent serves that model; a verdict for a model no longer pending changes nothing. */
  verdict(input: VerdictInput): Promise<VerdictOutcome> {
    return input.passed ? this.onPassed(input) : this.onFailed(input);
  }

  // Refreshed before the clash check: a sibling intent activated on another
  // instance would otherwise stay invisible until the cache's next interval.
  private async onPassed({
    selectorKey,
    modelId,
    runUrl,
  }: VerdictInput): Promise<VerdictOutcome> {
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
      return this.onConflict(selectorKey, modelId, servedBy);
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
    return APPLIED;
  }

  private async onFailed({
    selectorKey,
    modelId,
    runUrl,
    detail,
  }: VerdictInput): Promise<VerdictOutcome> {
    const applied = await this.repository.recordVerdict(
      selectorKey,
      modelId,
      { passed: false, runUrl, detail: failureDetail(detail) },
      new Date()
    );
    return applied ? APPLIED : NOT_PENDING;
  }

  private onConflict(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    servedBy: ModelIntent
  ): VerdictOutcome {
    this.logger.warn({
      event: 'ai.model_resolution.activation_conflict',
      selectorKey,
      modelId,
      servedBy,
    });
    return CONFLICT;
  }
}
