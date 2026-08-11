import type {
  ModelCatalog,
  ModelContextWindow,
  ModelPricing,
} from './model-catalog';

interface CatalogEntry {
  readonly mode: string;
  readonly pricing: ModelPricing;
  readonly contextWindow: ModelContextWindow;
}

const PROVIDER_TO_LITELLM: Record<string, (model: string) => string> = {
  anthropic: (model) => model,
  openai: (model) => model,
  google: (model) => `gemini/${model}`,
  openrouter: (model) => `openrouter/${model}`,
};

export function toLiteLLMKey(modelId: string): string | undefined {
  const separator = modelId.indexOf(':');
  if (separator <= 0) {
    return undefined;
  }
  const provider = modelId.slice(0, separator);
  const model = modelId.slice(separator + 1);
  return PROVIDER_TO_LITELLM[provider]?.(model);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function parseLiteLLMPricing(raw: unknown): Map<string, CatalogEntry> {
  const entries = new Map<string, CatalogEntry>();
  if (typeof raw !== 'object' || raw === null) {
    return entries;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry['mode'] !== 'string') {
      continue;
    }
    entries.set(key, {
      mode: entry['mode'],
      pricing: {
        inputCostPerToken: asNumber(entry['input_cost_per_token']),
        outputCostPerToken: asNumber(entry['output_cost_per_token']),
        cacheReadInputTokenCost: asNumber(entry['cache_read_input_token_cost']),
        cacheCreationInputTokenCost: asNumber(
          entry['cache_creation_input_token_cost']
        ),
        inputCostPerSecond: asNumber(entry['input_cost_per_second']),
      },
      contextWindow: {
        maxInputTokens: asNumber(entry['max_input_tokens']),
        maxOutputTokens: asNumber(entry['max_output_tokens']),
      },
    });
  }
  return entries;
}

export class LiteLLMCatalog implements ModelCatalog {
  private entries: Map<string, CatalogEntry>;

  constructor(raw: unknown) {
    this.entries = parseLiteLLMPricing(raw);
  }

  /** Replaces the catalog contents; ignores data that parses to zero entries. */
  update(raw: unknown): boolean {
    const parsed = parseLiteLLMPricing(raw);
    if (parsed.size === 0) {
      return false;
    }
    this.entries = parsed;
    return true;
  }

  get size(): number {
    return this.entries.size;
  }

  isSupported(modelId: string): boolean {
    return this.lookup(modelId)?.mode === 'chat';
  }

  getPricing(modelId: string): ModelPricing | undefined {
    return this.lookup(modelId)?.pricing;
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    return this.lookup(modelId)?.contextWindow;
  }

  private lookup(modelId: string): CatalogEntry | undefined {
    const key = toLiteLLMKey(modelId);
    return key === undefined ? undefined : this.entries.get(key);
  }
}
