import { Injectable, Logger } from '@nestjs/common';

import { OPENROUTER_PROVIDER, providerOf } from '@knowtis/ai-gateway';
import type { ModelReasoning, ReasoningEffort } from '@knowtis/shared-types';

import {
  clampEffort,
  type EffortAudience,
} from '../../domain/model-catalog/effort-policy';
import { AIConfigService } from './ai-config.service';
import { ModelPreferenceService } from './model-preference.service';

export interface TurnEffortRequest {
  readonly userId: string;
  readonly model: string;
  readonly isByok: boolean;
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
   * The effort a turn runs at: the caller's request when the model declares it
   * and the audience may spend it, else the configured global default where the
   * provider accepts it, else nothing. A refused or lowered request is logged
   * with a structured warn — never a silent mismatch.
   */
  async resolve({
    userId,
    model,
    isByok,
    requested,
  }: TurnEffortRequest): Promise<ReasoningEffort | undefined> {
    if (!requested) {
      return this.defaultFor(model, userId);
    }
    const audience: Exclude<EffortAudience, 'anonymous'> = isByok
      ? 'byok'
      : 'free';
    const declared = await this.modelPreference.reasoningFor(model, userId);
    const clamped = clampEffort(requested, declared, audience);
    if (clamped === null) {
      this.logger.warn({
        event: 'agent.effort_fallback',
        model,
        requested,
      });
      return this.defaultFor(model, userId, declared);
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
   * The global default, only where the provider will accept it: always for
   * OpenRouter, and for a direct provider only when the model declares that
   * level — an undeclared model gets no reasoning option, so the SDK's own
   * capability checks are never bypassed.
   */
  private async defaultFor(
    model: string,
    userId: string,
    declared?: ModelReasoning | null
  ): Promise<ReasoningEffort | undefined> {
    if (providerOf(model) === OPENROUTER_PROVIDER) {
      return this.aiConfig.getReasoningEffort();
    }
    const [fallback, levels] = await Promise.all([
      this.aiConfig.getReasoningEffort(),
      declared === undefined
        ? this.modelPreference
            .reasoningFor(model, userId)
            .then((r) => r?.levels)
        : Promise.resolve(declared?.levels),
    ]);
    return levels?.includes(fallback) ? fallback : undefined;
  }
}
