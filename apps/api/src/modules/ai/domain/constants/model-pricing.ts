import type { SupportedModel } from '../value-objects/ai-model.vo';

export interface ModelPricing {
  readonly input: number;
  readonly output: number;
}

/** Anthropic ephemeral cache ratios applied to the base input rate. */
export const ANTHROPIC_CACHE_READ_MULTIPLIER = 0.1;
export const ANTHROPIC_CACHE_WRITE_MULTIPLIER = 1.25;

const DEFAULT_MODEL_PRICING = {
  'anthropic:claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'anthropic:claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'google:gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'google:gemini-2.5-pro': { input: 1.25, output: 10.0 },
} satisfies Record<SupportedModel, ModelPricing>;

export function getModelPricing(model: string): ModelPricing | undefined {
  return (DEFAULT_MODEL_PRICING as Record<string, ModelPricing>)[model];
}
