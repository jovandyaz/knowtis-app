export const INDEX_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
] as const;
export type IndexProvider = (typeof INDEX_PROVIDERS)[number];

export const MODELS_DEV_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
] as const satisfies readonly IndexProvider[];

export const MODEL_STATUSES = [
  'active',
  'beta',
  'alpha',
  'deprecated',
] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

export const DEFAULT_MODEL_STATUS: ModelStatus = 'active';

export const INDEX_SOURCES = ['models_dev', 'openrouter'] as const;
export type IndexSource = (typeof INDEX_SOURCES)[number];

export interface IndexedReasoning {
  /** Effort values as the source lists them (lowercase), highest first is NOT guaranteed. */
  readonly levels: readonly string[];
  readonly mandatory: boolean;
}

/** One provider route of one model, normalized from its source. Costs are USD per token. */
export interface IndexedModel {
  /** `provider:model`, e.g. `openrouter:deepseek/deepseek-v3.2`. */
  readonly id: string;
  readonly provider: IndexProvider;
  readonly name: string;
  readonly family: string | null;
  /** `YYYY-MM-DD` (a `YYYY-MM` source date gets `-01`). */
  readonly releasedAt: string | null;
  readonly status: ModelStatus;
  readonly toolCall: boolean | null;
  readonly structuredOutput: boolean | null;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
  readonly inputCostPerToken: number | null;
  readonly outputCostPerToken: number | null;
  readonly cacheReadCostPerToken: number | null;
  readonly cacheWriteCostPerToken: number | null;
  readonly maxInputTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly reasoning: IndexedReasoning | null;
  readonly canonical: string;
  readonly openWeights: boolean | null;
  /** `YYYY-MM-DD`. */
  readonly retiresAt: string | null;
  readonly source: IndexSource;
}

export const TOKENS_PER_MILLION = 1_000_000;

const VARIANT_SEPARATOR = ':';
const DOT_BETWEEN_DIGITS = /(?<=\d)\.(?=\d)/g;

/** `author/slug` identity shared by every route of one model: digit dots become dashes and `:variant` is dropped, matching models.dev `canonical_model_id`. */
export function deriveCanonical(authorSlug: string): string {
  const variantStart = authorSlug.indexOf(VARIANT_SEPARATOR);
  const withoutVariant =
    variantStart === -1 ? authorSlug : authorSlug.slice(0, variantStart);
  return withoutVariant.replace(DOT_BETWEEN_DIGITS, '-').toLowerCase();
}
