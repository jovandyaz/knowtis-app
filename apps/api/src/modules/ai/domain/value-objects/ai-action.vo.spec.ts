import { describe, expect, it } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import {
  AIAction,
  COMPLETION_AI_ACTIONS,
  SUPPORTED_AI_ACTIONS,
} from './ai-action.vo';

describe('AIAction', () => {
  it.each(SUPPORTED_AI_ACTIONS)('should create valid action: %s', (action) => {
    const result = AIAction.create(action);
    expect(result.isOk()).toBe(true);
  });

  it('should fail for an invalid action', () => {
    const result = AIAction.create('fly');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_INVALID_ACTION');
    }
  });

  it('should fail for empty string', () => {
    const result = AIAction.create('');
    expect(result.isErr()).toBe(true);
  });

  it.each([
    AI_ACTION.SUGGEST_ORGANIZATION,
    AI_ACTION.VOICE_TRANSCRIPTION,
    AI_ACTION.STRUCTURE_VOICE_NOTE,
    AI_ACTION.GENERATE_FLASHCARDS,
    AI_ACTION.GENERATE_QUIZ,
    AI_ACTION.GENERATE_SUMMARY,
    AI_ACTION.GENERATE_MIND_MAP,
  ])('keeps %s off the generic completion surface', (action) => {
    expect(COMPLETION_AI_ACTIONS).not.toContain(action);
    expect(SUPPORTED_AI_ACTIONS).toContain(action);
  });

  it('accepts on the completion surface exactly the actions the notes client sends', () => {
    expect([...COMPLETION_AI_ACTIONS].sort()).toEqual([
      'action-items',
      'fix-spelling',
      'ghost-text',
      'improve-writing',
      'learn-topic',
      'make-longer',
      'make-shorter',
      'outline',
      'summarize',
      'tone',
      'translate',
    ]);
  });
});
