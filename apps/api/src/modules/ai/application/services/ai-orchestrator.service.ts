import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Result } from 'neverthrow';

import { AI_ACTION } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import type { AIDomainError } from '../../domain/errors/ai.errors';
import { sanitizeContent } from '../../domain/services/input-sanitizer';
import type { SupportedAIAction } from '../../domain/value-objects/ai-action.vo';
import { AIModel } from '../../domain/value-objects/ai-model.vo';

const FAST_MODEL_ACTIONS = new Set<SupportedAIAction>([AI_ACTION.GHOST_TEXT]);

const PRESERVE_LANGUAGE =
  'IMPORTANT: Detect the language of the input text and respond in the SAME language. Do not translate unless explicitly asked.';

const SYSTEM_PROMPTS: Record<SupportedAIAction, string> = {
  summarize: `You are a writing assistant. Summarize the following content concisely, preserving key points and structure. Output only the summary, no preamble. ${PRESERVE_LANGUAGE}`,
  expand: `You are a writing assistant. Expand the following content with more detail, examples, and depth. Maintain the original tone and style. Output only the expanded content. ${PRESERVE_LANGUAGE}`,
  translate:
    'You are a translation assistant. Translate the following content accurately while preserving tone and meaning. Output only the translated text.',
  tone: `You are a writing assistant. Rewrite the following content in the requested tone while preserving the meaning. Output only the rewritten content. ${PRESERVE_LANGUAGE}`,
  outline: `You are a writing assistant. Create a structured outline from the following content or ideas. Use markdown headings and bullet points. Output only the outline. ${PRESERVE_LANGUAGE}`,
  'action-items': `You are a productivity assistant. Extract actionable items from the following content. Format as a markdown checklist. Output only the action items. ${PRESERVE_LANGUAGE}`,
  'ghost-text':
    'You are an inline autocomplete assistant for a text editor. Generate a natural continuation at the cursor position.\n\nRules:\n- Output ONLY the new text to insert at the cursor. Nothing else.\n- Do NOT repeat any text from the prefix or suffix.\n- Keep it short: 1-2 sentences maximum.\n- Match the language, tone, and style of the surrounding text.\n- If suffix text exists, ensure your completion flows naturally into it.',
  chat: `You are a helpful assistant for a note-taking app. Answer questions about the note content provided. Be concise and helpful. ${PRESERVE_LANGUAGE}`,
  'improve-writing': `You are a writing assistant. Improve the clarity, flow, and readability of the following text while preserving its meaning. Fix grammar, improve word choice, and enhance sentence structure. Output only the improved text. ${PRESERVE_LANGUAGE}`,
  'fix-spelling': `You are a proofreading assistant. Fix all spelling errors, typos, and grammatical mistakes in the following text. Preserve the original meaning and tone. Output only the corrected text. ${PRESERVE_LANGUAGE}`,
  'make-shorter': `You are a writing assistant. Make the following text more concise without losing key information. Remove redundancy and tighten the prose. Output only the shortened text. ${PRESERVE_LANGUAGE}`,
  'make-longer': `You are a writing assistant. Expand the following text with more detail and supporting points while maintaining the same tone and style. Output only the expanded text. ${PRESERVE_LANGUAGE}`,
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
