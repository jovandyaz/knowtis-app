export const OPENROUTER_MODELS_CLIENT = Symbol('OPENROUTER_MODELS_CLIENT');

/** One model as published by OpenRouter: costs are USD per token and `id` carries no `openrouter:` prefix. */
export interface UpstreamModel {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  contextLength: number;
  maxCompletionTokens: number | null;
  promptCostPerToken: number;
  completionCostPerToken: number;
  /** Null when upstream publishes no date or a far-future sentinel meaning "never expires". */
  expirationDate: Date | null;
  intelligenceIndex: number | null;
  outputModalities: readonly string[];
}

export interface OpenRouterModelsClient {
  /** Every model upstream publishes, following pagination. Rejects on a non-2xx response; models whose payload cannot be parsed are dropped, not thrown on. */
  fetchModels(): Promise<UpstreamModel[]>;
}
