import { Inject, Injectable } from '@nestjs/common';
import type { Result } from 'neverthrow';

import {
  MODEL_CATALOG,
  sanitizeContent,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import { AI_ACTION } from '@knowtis/shared-types';

import type { AIDomainError } from '../../domain/errors/ai.errors';
import type { SupportedAIAction } from '../../domain/value-objects/ai-action.vo';
import { AIModel } from '../../domain/value-objects/ai-model.vo';
import { AIConfigService } from './ai-config.service';
import { PromptLoaderService } from './prompt-loader.service';

const FAST_MODEL_ACTIONS = new Set<SupportedAIAction>([
  AI_ACTION.GHOST_TEXT,
  AI_ACTION.SUGGEST_ORGANIZATION,
]);

@Injectable()
export class AIOrchestrator {
  constructor(
    private readonly aiConfigService: AIConfigService,
    private readonly promptLoader: PromptLoaderService,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog
  ) {}

  async selectModel(
    action: SupportedAIAction
  ): Promise<Result<AIModel, AIDomainError>> {
    const modelStr = FAST_MODEL_ACTIONS.has(action)
      ? await this.aiConfigService.getFastModel()
      : await this.aiConfigService.getDefaultModel();
    return AIModel.create(modelStr, this.modelCatalog);
  }

  getSystemPrompt(action: SupportedAIAction): string {
    return this.promptLoader.getPrompt(action).content;
  }

  buildUserPrompt(
    input: {
      content: string;
      selection?: string;
      suffix?: string;
      targetLanguage?: string;
      targetTone?: string;
    },
    action: SupportedAIAction
  ): string {
    if (action === AI_ACTION.GHOST_TEXT) {
      const prefix = sanitizeContent(input.content);
      const suffix = input.suffix ? sanitizeContent(input.suffix) : '';
      if (suffix) {
        return `[TEXT BEFORE CURSOR]\n${prefix}\n\n[CURSOR - INSERT HERE]\n\n[TEXT AFTER CURSOR]\n${suffix}`;
      }
      return `[TEXT BEFORE CURSOR]\n${prefix}\n\n[CURSOR - INSERT HERE]`;
    }

    const text = sanitizeContent(input.selection ?? input.content);
    if (action === AI_ACTION.TRANSLATE && input.targetLanguage) {
      return `Translate to ${input.targetLanguage}:\n\n${text}`;
    }
    if (action === AI_ACTION.TONE && input.targetTone) {
      return `Rewrite in a ${input.targetTone} tone:\n\n${text}`;
    }
    return text;
  }
}
