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
  ])('keeps %s off the generic completion surface', (action) => {
    expect(COMPLETION_AI_ACTIONS).not.toContain(action);
    expect(SUPPORTED_AI_ACTIONS).toContain(action);
  });

  it('still accepts every other action for completion', () => {
    expect(COMPLETION_AI_ACTIONS).toHaveLength(SUPPORTED_AI_ACTIONS.length - 3);
    expect(COMPLETION_AI_ACTIONS).toContain(AI_ACTION.LEARN_TOPIC);
    expect(COMPLETION_AI_ACTIONS).toContain(AI_ACTION.SUMMARIZE);
  });
});
