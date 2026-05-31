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

  it('should bill cache-read tokens at the discounted rate', () => {
    const usage = TokenUsage.create({
      inputTokens: 1000,
      outputTokens: 100,
      model: 'anthropic:claude-sonnet-4-20250514',
      cacheReadTokens: 800,
    });
    expect(usage.costUsd).toBeCloseTo(0.00234, 8);
  });

  it('should bill cache-write tokens at the premium rate', () => {
    const usage = TokenUsage.create({
      inputTokens: 1000,
      outputTokens: 0,
      model: 'anthropic:claude-sonnet-4-20250514',
      cacheWriteTokens: 1000,
    });
    expect(usage.costUsd).toBeCloseTo(0.00375, 8);
  });

  it('should be backward compatible when no cache tokens are provided', () => {
    const usage = TokenUsage.create({
      inputTokens: 1000,
      outputTokens: 500,
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(usage.costUsd).toBeCloseTo(0.0105, 8);
  });
});
