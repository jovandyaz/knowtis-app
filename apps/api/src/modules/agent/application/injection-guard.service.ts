import { Injectable } from '@nestjs/common';

import { detectPromptInjection } from '@knowtis/ai-gateway';

import {
  INJECTION_GRAY_ZONE_MIN,
  InjectionClassifierService,
  type ClassifierVerdict,
} from '../../ai/application/services/injection-classifier.service';
import type { AiExecutionContext } from '../../ai/domain/execution-context/ai-execution-context';

/** Verdict from {@link InjectionGuardService.guard} and {@link InjectionGuardService.guardPersistent}: `score` is the heuristic injection score (0–1) that drove `safe`; `degraded` means the classifier could not decide. */
export interface InjectionVerdict {
  safe: boolean;
  score: number;
  degraded?: true;
}

/**
 * Single owner of the prompt-injection escalation policy shared by the agent
 * turn handler, the web-fetch tool, retrieved-note scanning and memory writes:
 * heuristic guard, then a model classifier for gray-zone scores.
 */
@Injectable()
export class InjectionGuardService {
  constructor(
    private readonly injectionClassifier: InjectionClassifierService
  ) {}

  /** For text read into the current turn: a classifier that could not decide lets it through. */
  guard(
    text: string,
    execution: AiExecutionContext
  ): Promise<InjectionVerdict> {
    return this.screen(text, execution, (verdict) => verdict.safe);
  }

  /** For text stored and replayed into later prompts: a classifier that could not decide blocks it. */
  guardPersistent(
    text: string,
    execution: AiExecutionContext
  ): Promise<InjectionVerdict> {
    return this.screen(
      text,
      execution,
      (verdict) => verdict.safe && !verdict.degraded
    );
  }

  private async screen(
    text: string,
    execution: AiExecutionContext,
    accepts: (verdict: ClassifierVerdict) => boolean
  ): Promise<InjectionVerdict> {
    const check = detectPromptInjection(text);
    if (!check.safe) {
      return { safe: false, score: check.score };
    }
    if (check.score >= INJECTION_GRAY_ZONE_MIN) {
      const verdict = await this.injectionClassifier.classify(text, execution);
      return {
        safe: accepts(verdict),
        score: check.score,
        ...(verdict.degraded ? { degraded: verdict.degraded } : {}),
      };
    }
    return { safe: true, score: check.score };
  }
}
