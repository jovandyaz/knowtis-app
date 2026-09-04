import { describe, expect, it } from 'vitest';

import {
  AGENT_STOP_REASON,
  AI_CONFIG_KEYS,
  GLOBAL_REASONING_EFFORTS,
  isGlobalReasoningEffort,
  isReasoningEffort,
  MESSAGE_STOP_REASON,
  MODEL_ACCESS,
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

describe('model access', () => {
  it('distinguishes account-gated models from BYOK-gated ones', () => {
    expect(MODEL_ACCESS).toContain('requires_account');
  });
});

describe('stop reasons', () => {
  it('lists every loop stop reason plus the two interrupted outcomes', () => {
    expect(MESSAGE_STOP_REASON).toEqual([
      'completed',
      'max_steps',
      'length',
      'token_budget',
      'content_filter',
      'error',
      'aborted',
    ]);
    expect(Object.values(AGENT_STOP_REASON)).toEqual([
      'completed',
      'max_steps',
      'length',
      'token_budget',
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
