import { describe, expect, it } from 'vitest';

import { TokenUsage } from './token-usage.vo';

describe('TokenUsage', () => {
  it('should calculate cost for claude-sonnet-4-5', () => {
    const usage = TokenUsage.create({
      inputTokens: 1000,
      outputTokens: 500,
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(usage.costUsd).toBeCloseTo(0.0105, 4);
    expect(usage.totalTokens).toBe(1500);
  });

  it('should calculate cost for claude-haiku-4-5', () => {
    const usage = TokenUsage.create({
      inputTokens: 1000,
      outputTokens: 500,
      model: 'anthropic:claude-haiku-4-5-20251001',
    });
    expect(usage.costUsd).toBeCloseTo(0.0028, 4);
    expect(usage.totalTokens).toBe(1500);
  });

  it('should handle zero tokens', () => {
    const usage = TokenUsage.create({
      inputTokens: 0,
      outputTokens: 0,
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(usage.costUsd).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });

  it('should default to zero cost for unknown model', () => {
    const usage = TokenUsage.create({
      inputTokens: 1000,
      outputTokens: 500,
      model: 'unknown-model',
    });
    expect(usage.costUsd).toBe(0);
  });
});
