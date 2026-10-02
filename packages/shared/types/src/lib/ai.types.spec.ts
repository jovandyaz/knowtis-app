import { describe, expect, it } from 'vitest';

import {
  AGENT_STOP_REASON,
  AI_ACTION,
  AI_ACTIONS,
  AI_CONFIG_KEYS,
  COMPLETION_AI_ACTIONS,
  CONTINUABLE_STOP_REASONS,
  GLOBAL_REASONING_EFFORTS,
  isAgentStopReason,
  isByokProvider,
  isContinuableStop,
  isGlobalReasoningEffort,
  isReasoningEffort,
  MESSAGE_STOP_REASON,
  REASONING_EFFORTS,
} from './ai.types';

describe('reasoning efforts', () => {
  it('includes the per-model levels beyond the global range', () => {
    expect(REASONING_EFFORTS).toContain('max');
    expect(REASONING_EFFORTS).toContain('xhigh');
    expect(isReasoningEffort('max')).toBe(true);
  });

  it('keeps the global setting narrower than the per-model levels', () => {
    expect(GLOBAL_REASONING_EFFORTS).toEqual(['low', 'medium', 'high']);
    expect(isGlobalReasoningEffort('xhigh')).toBe(false);
    expect(isGlobalReasoningEffort('max')).toBe(false);
    expect(isGlobalReasoningEffort('medium')).toBe(true);
  });
});

describe('completion actions', () => {
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
    expect(AI_ACTIONS).toContain(action);
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

describe('stop reasons', () => {
  it('lists every loop stop reason plus the two interrupted outcomes', () => {
    expect(MESSAGE_STOP_REASON).toEqual([
      'completed',
      'max_steps',
      'length',
      'token_budget',
      'time_limit',
      'content_filter',
      'error',
      'aborted',
    ]);
    expect(Object.values(AGENT_STOP_REASON)).toEqual([
      'completed',
      'max_steps',
      'length',
      'token_budget',
      'time_limit',
      'content_filter',
    ]);
  });
});

describe('AI config keys', () => {
  it('names every ai_config row once, under the ai_ prefix', () => {
    const keys = Object.values(AI_CONFIG_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^ai_[a-z_]+$/);
    }
  });
});

describe('isByokProvider', () => {
  it.each(['anthropic', 'openai', 'google', 'openrouter'])(
    'accepts %s',
    (provider) => {
      expect(isByokProvider(provider)).toBe(true);
    }
  );

  it('rejects a provider that takes no stored key', () => {
    expect(isByokProvider('mistral')).toBe(false);
  });
});

describe('isAgentStopReason', () => {
  it.each(Object.values(AGENT_STOP_REASON))('knows %s', (reason) => {
    expect(isAgentStopReason(reason)).toBe(true);
  });

  it.each(['error', 'aborted', 'reconsidered', '', null, undefined])(
    'does not know %s',
    (value) => {
      expect(isAgentStopReason(value)).toBe(false);
    }
  );
});

describe('continuable stops', () => {
  it('are the checkpoints a segment closes at', () => {
    expect(CONTINUABLE_STOP_REASONS).toEqual([
      'max_steps',
      'token_budget',
      'time_limit',
    ]);
    for (const reason of CONTINUABLE_STOP_REASONS) {
      expect(isContinuableStop(reason)).toBe(true);
    }
  });

  it.each([
    'completed',
    'length',
    'content_filter',
    'error',
    'aborted',
    null,
    undefined,
  ])('%s is not a checkpoint', (reason) => {
    expect(isContinuableStop(reason)).toBe(false);
  });
});
