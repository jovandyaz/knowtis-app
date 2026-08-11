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

/** One upstream read. A model missing from `models` is only known to be gone when `complete` is true and its id is not in `discarded`. */
export interface UpstreamCatalog {
  models: readonly UpstreamModel[];
  /** False when pagination stopped early, so models past the cut were never seen. */
  complete: boolean;
  /** Ids upstream published whose payload failed validation: absent from `models`, but not gone. */
  discarded: readonly string[];
}

export interface OpenRouterModelsClient {
  /** Every model upstream publishes, following pagination. Rejects on a non-2xx response; models whose payload cannot be parsed are collected into `discarded`, not thrown on. */
  fetchModels(): Promise<UpstreamCatalog>;
}
