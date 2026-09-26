import { Injectable } from '@nestjs/common';

import { detectPromptInjection } from '@knowtis/ai-gateway';

import {
  INJECTION_GRAY_ZONE_MIN,
  InjectionClassifierService,
} from '../../ai/application/services/injection-classifier.service';

/** Verdict from {@link InjectionGuardService.guard}: `score` is the heuristic injection score (0–1) that drove `safe`. */
export interface InjectionVerdict {
  safe: boolean;
  score: number;
}

/**
 * Single owner of the prompt-injection escalation policy shared by the agent
 * turn handler, the web-fetch tool, and retrieved-note scanning: heuristic
 * guard, then a model classifier for gray-zone scores.
 */
@Injectable()
export class InjectionGuardService {
  constructor(
    private readonly injectionClassifier: InjectionClassifierService
  ) {}

  async guard(text: string, userId: string): Promise<InjectionVerdict> {
    const check = detectPromptInjection(text);
    if (!check.safe) {
      return { safe: false, score: check.score };
    }
    if (check.score >= INJECTION_GRAY_ZONE_MIN) {
      const verdict = await this.injectionClassifier.classify(text, userId);
      return { safe: verdict.safe, score: check.score };
    }
    return { safe: true, score: check.score };
  }
}
