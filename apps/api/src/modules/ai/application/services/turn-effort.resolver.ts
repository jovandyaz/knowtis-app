import { Injectable, Logger } from '@nestjs/common';

import { OPENROUTER_PROVIDER, providerOf } from '@knowtis/ai-gateway';
import type { ModelReasoning, ReasoningEffort } from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import {
  clampEffort,
  nearestEffort,
  toolFreeEffort,
  type EffortAudience,
  type TurnEffort,
} from '../../domain/model-catalog/effort-policy';
import { AIConfigService } from './ai-config.service';
import { ModelPreferenceService } from './model-preference.service';

export interface TurnEffortRequest {
  readonly execution: AiExecutionContext;
  readonly model: string;
  readonly requested?: ReasoningEffort | undefined;
}

@Injectable()
export class TurnEffortResolver {
  private readonly logger = new Logger(TurnEffortResolver.name);

  constructor(
    private readonly aiConfig: AIConfigService,
    private readonly modelPreference: ModelPreferenceService
  ) {}

  /**
   * The levels a turn runs at on `model`, or nothing when it sends no reasoning
   * option. Every call runs at the caller's request when the model declares it
   * and the audience may spend it, else at the configured global default where
   * the route accepts it; a call sent without its tools is lowered within the
   * same ladder. A refused or lowered request is logged with a structured warn
   * — never a silent mismatch.
   */
  async resolve({
    execution,
    model,
    requested,
  }: TurnEffortRequest): Promise<TurnEffort | undefined> {
    const declared = await this.modelPreference.reasoningFor(
      model,
      execution.byokProviders
    );
    const step = await this.stepEffort(model, declared, execution, requested);
    return step === undefined
      ? undefined
      : { step, toolFree: toolFreeEffort(declared?.levels) };
  }

  private async stepEffort(
    model: string,
    declared: ModelReasoning | null,
    execution: AiExecutionContext,
    requested: ReasoningEffort | undefined
  ): Promise<ReasoningEffort | undefined> {
    if (!requested) {
      return this.defaultFor(model, declared);
    }
    const audience: Exclude<EffortAudience, 'anonymous'> =
      execution.billing.kind === 'byok' ? 'byok' : 'free';
    const clamped = clampEffort(requested, declared, audience);
    if (clamped === null) {
      this.logger.warn({
        event: 'agent.effort_fallback',
        model,
        requested,
      });
      return this.defaultFor(model, declared);
    }
    if (clamped !== requested) {
      this.logger.warn({
        event: 'agent.effort_clamped',
        model,
        requested,
        applied: clamped,
      });
    }
    return clamped;
  }

  /**
   * The global default, only where the route accepts it: as is when the
   * model's ladder lists it. Otherwise OpenRouter gets the ladder's nearest
   * level, or the default itself when the ladder is unknown, since OpenRouter
   * maps an unsupported effort to the nearest one the model supports and an
   * upstream ignores parameters it does not support. A direct provider gets
   * no reasoning option, so the SDK's own capability checks are never
   * bypassed.
   */
  private async defaultFor(
    model: string,
    declared: ModelReasoning | null
  ): Promise<ReasoningEffort | undefined> {
    const fallback = await this.aiConfig.getReasoningEffort();
    const levels = declared?.levels ?? [];
    if (levels.includes(fallback)) {
      return fallback;
    }
    if (providerOf(model) !== OPENROUTER_PROVIDER) {
      return undefined;
    }
    return levels.length === 0 ? fallback : nearestEffort(fallback, levels);
  }
}
