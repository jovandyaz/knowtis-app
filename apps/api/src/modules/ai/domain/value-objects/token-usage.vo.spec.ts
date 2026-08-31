import { describe, expect, it } from 'vitest';

import { createTestCatalog } from '../../testing/create-test-catalog';
import { TokenUsage } from './token-usage.vo';

const catalog = createTestCatalog();
const pricingFor = (model: string) => catalog.getPricing(model);

describe('TokenUsage', () => {
  it('should calculate cost for claude-sonnet-4-5', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'anthropic:claude-sonnet-4-20250514',
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBeCloseTo(0.0105, 4);
    expect(usage.totalTokens).toBe(1500);
  });

  it('should calculate cost for claude-haiku-4-5', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'anthropic:claude-haiku-4-5',
      },
      pricingFor('anthropic:claude-haiku-4-5')
    );
    expect(usage.costUsd).toBeCloseTo(0.0028, 4);
    expect(usage.totalTokens).toBe(1500);
  });

  it('should handle zero tokens', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 0,
        outputTokens: 0,
        model: 'anthropic:claude-sonnet-4-20250514',
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });

  it('should default to zero cost when the catalog has no pricing', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'unknown-model',
      },
      pricingFor('unknown-model')
    );
    expect(usage.costUsd).toBe(0);
  });

  it('should bill cache-read tokens at the discounted rate', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 100,
        model: 'anthropic:claude-sonnet-4-20250514',
        cacheReadTokens: 800,
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBeCloseTo(0.00234, 8);
  });

  it('should bill cache-write tokens at the premium rate', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 0,
        model: 'anthropic:claude-sonnet-4-20250514',
        cacheWriteTokens: 1000,
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBeCloseTo(0.00375, 8);
  });

  it('should be backward compatible when no cache tokens are provided', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'anthropic:claude-sonnet-4-20250514',
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBeCloseTo(0.0105, 8);
  });

  it('should bill mixed cache-read and cache-write tokens in one request', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 0,
        model: 'anthropic:claude-sonnet-4-20250514',
        cacheReadTokens: 500,
        cacheWriteTokens: 300,
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBeCloseTo(0.001875, 8);
  });

  it('should ignore cache tokens for non-Anthropic models', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 1000,
        outputTokens: 0,
        model: 'google:gemini-2.0-flash',
        cacheReadTokens: 800,
      },
      pricingFor('google:gemini-2.0-flash')
    );
    expect(usage.costUsd).toBeCloseTo(0.0001, 8);
  });

  it('should never produce negative cost when cache tokens exceed input tokens', () => {
    const usage = TokenUsage.create(
      {
        inputTokens: 100,
        outputTokens: 0,
        model: 'anthropic:claude-sonnet-4-20250514',
        cacheReadTokens: 80,
        cacheWriteTokens: 80,
      },
      pricingFor('anthropic:claude-sonnet-4-20250514')
    );
    expect(usage.costUsd).toBeGreaterThanOrEqual(0);
    expect(usage.costUsd).toBeCloseTo(0.000324, 8);
  });
});
