import { Injectable, Logger } from '@nestjs/common';

import { detectPromptInjection } from '@knowtis/ai-gateway';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import {
  INJECTION_GRAY_ZONE_MIN,
  InjectionClassifierService,
} from '../../ai/application/services/injection-classifier.service';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';

/**
 * Single owner of the prompt-injection escalation policy shared by the agent
 * turn handler and the web-fetch tool: heuristic guard, then a model classifier
 * for gray-zone scores when `agent_injection_classifier` is on. Fail-open on the
 * flag lookup (treated as off) so a flag-store outage never blocks a turn.
 */
@Injectable()
export class InjectionGuardService {
  private readonly logger = new Logger(InjectionGuardService.name);

  constructor(
    private readonly injectionClassifier: InjectionClassifierService,
    private readonly featureFlags: FeatureFlagsService
  ) {}

  async guard(text: string, userId: string): Promise<{ safe: boolean }> {
    const check = detectPromptInjection(text);
    if (!check.safe) {
      return { safe: false };
    }
    if (
      check.score >= INJECTION_GRAY_ZONE_MIN &&
      (await this.classifierFlagOn())
    ) {
      return this.injectionClassifier.classify(text, userId);
    }
    return { safe: true };
  }

  private async classifierFlagOn(): Promise<boolean> {
    try {
      return await this.featureFlags.isEnabled(
        FEATURE_FLAG_KEYS.AGENT_INJECTION_CLASSIFIER
      );
    } catch (error) {
      this.logger.warn(
        'Injection classifier flag lookup failed, treating as off',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }
}
