export const MODEL_CATALOG = Symbol('MODEL_CATALOG');

export interface ModelPricing {
  readonly inputCostPerToken?: number | undefined;
  readonly outputCostPerToken?: number | undefined;
  readonly cacheReadInputTokenCost?: number | undefined;
  readonly cacheCreationInputTokenCost?: number | undefined;
  readonly inputCostPerSecond?: number | undefined;
}

export interface ModelContextWindow {
  readonly maxInputTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
}

export interface ModelCatalog {
  isSupported(modelId: string): boolean;
  isFast(modelId: string): boolean;
  getPricing(modelId: string): ModelPricing | undefined;
  getContextWindow(modelId: string): ModelContextWindow | undefined;
}
