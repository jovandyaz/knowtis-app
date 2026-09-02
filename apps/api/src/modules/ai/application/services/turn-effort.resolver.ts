import { Injectable, Logger } from '@nestjs/common';

import type { ReasoningEffort } from '@knowtis/shared-types';

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
   * and the audience may spend it, else the configured global default.
   */
  async resolve({
    userId,
    model,
    isByok,
    requested,
  }: TurnEffortRequest): Promise<ReasoningEffort> {
    if (!requested) {
      return this.aiConfig.getReasoningEffort();
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
      return this.aiConfig.getReasoningEffort();
    }
    return clamped;
  }
}
