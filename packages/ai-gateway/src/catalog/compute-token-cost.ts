import type { ModelPricing } from './model-catalog';

const CACHE_READ_FALLBACK_MULTIPLIER = 0.1;
const CACHE_WRITE_FALLBACK_MULTIPLIER = 1.25;

export interface TokenCostInput {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number | undefined;
  readonly cacheWriteTokens?: number | undefined;
}

/**
 * Returns the USD cost of a completion. Cache token rates come from the
 * pricing entry when present, otherwise fall back to multiplying the base
 * input rate (Anthropic's published cache ratios).
 */
export function computeTokenCostUsd(
  input: TokenCostInput,
  pricing: ModelPricing
): number {
  const inputRate = pricing.inputCostPerToken ?? 0;
  const outputRate = pricing.outputCostPerToken ?? 0;
  const cacheReadRate =
    pricing.cacheReadInputTokenCost ??
    inputRate * CACHE_READ_FALLBACK_MULTIPLIER;
  const cacheWriteRate =
    pricing.cacheCreationInputTokenCost ??
    inputRate * CACHE_WRITE_FALLBACK_MULTIPLIER;
  const inputTokens = Math.max(0, input.inputTokens);
  const outputTokens = Math.max(0, input.outputTokens);
  const cacheRead = Math.max(0, input.cacheReadTokens ?? 0);
  const cacheWrite = Math.max(0, input.cacheWriteTokens ?? 0);
  const nonCached = Math.max(0, inputTokens - cacheRead - cacheWrite);
  return (
    nonCached * inputRate +
    cacheRead * cacheReadRate +
    cacheWrite * cacheWriteRate +
    outputTokens * outputRate
  );
}
