import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Result } from 'neverthrow';

import { AI_ACTION } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { SYSTEM_PROMPTS } from '../../domain/constants/system-prompts';
import type { AIDomainError } from '../../domain/errors/ai.errors';
import { sanitizeContent } from '../../domain/services/input-sanitizer';
import type { SupportedAIAction } from '../../domain/value-objects/ai-action.vo';
import { AIModel } from '../../domain/value-objects/ai-model.vo';

const FAST_MODEL_ACTIONS = new Set<SupportedAIAction>([AI_ACTION.GHOST_TEXT]);

@Injectable()
export class AIOrchestrator {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  selectModel(action: SupportedAIAction): Result<AIModel, AIDomainError> {
    const modelStr = FAST_MODEL_ACTIONS.has(action)
      ? this.configService.get('AI_FAST_MODEL')
      : this.configService.get('AI_DEFAULT_MODEL');
    return AIModel.create(modelStr);
  }

  getSystemPrompt(action: SupportedAIAction): string {
    return SYSTEM_PROMPTS[action];
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
