import type { SupportedModel } from '../value-objects/ai-model.vo';

export interface ModelPricing {
  readonly input: number;
  readonly output: number;
}

/**
 * Pricing per 1M tokens (USD).
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'anthropic:claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'anthropic:claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
} satisfies Record<SupportedModel, ModelPricing>;
