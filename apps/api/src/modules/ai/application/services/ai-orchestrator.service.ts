import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Result } from 'neverthrow';

import type { EnvConfig } from '../../../../config/env.config';
import type { AIDomainError } from '../../domain/errors/ai.errors';
import { sanitizeContent } from '../../domain/services/input-sanitizer';
import type { SupportedAIAction } from '../../domain/value-objects/ai-action.vo';
import { AIModel } from '../../domain/value-objects/ai-model.vo';

const FAST_MODEL_ACTIONS = new Set<SupportedAIAction>(['ghost-text']);

const SYSTEM_PROMPTS: Record<SupportedAIAction, string> = {
  summarize:
    'You are a writing assistant. Summarize the following content concisely, preserving key points and structure. Output only the summary, no preamble.',
  expand:
    'You are a writing assistant. Expand the following content with more detail, examples, and depth. Maintain the original tone and style. Output only the expanded content.',
  translate:
    'You are a translation assistant. Translate the following content accurately while preserving tone and meaning. Output only the translated text.',
  tone: 'You are a writing assistant. Rewrite the following content in the requested tone while preserving the meaning. Output only the rewritten content.',
  outline:
    'You are a writing assistant. Create a structured outline from the following content or ideas. Use markdown headings and bullet points. Output only the outline.',
  'action-items':
    'You are a productivity assistant. Extract actionable items from the following content. Format as a markdown checklist. Output only the action items.',
  'ghost-text':
    'You are an autocomplete assistant. Continue the text naturally from where it ends. Output only the continuation (1-2 sentences max). Do not repeat the existing text.',
  chat: 'You are a helpful assistant for a note-taking app. Answer questions about the note content provided. Be concise and helpful.',
};

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
      targetLanguage?: string;
      targetTone?: string;
    },
    action: SupportedAIAction
  ): string {
    const text = sanitizeContent(input.selection ?? input.content);
    if (action === 'translate' && input.targetLanguage) {
      return `Translate to ${input.targetLanguage}:\n\n${text}`;
    }
    if (action === 'tone' && input.targetTone) {
      return `Rewrite in a ${input.targetTone} tone:\n\n${text}`;
    }
    return text;
  }
}
