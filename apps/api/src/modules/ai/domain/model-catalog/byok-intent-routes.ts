import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

/** One model as its creator names it, with the model id each provider serves it under. */
export interface CanonicalModel {
  readonly slug: string;
  readonly label: string;
  readonly routes: Readonly<Partial<Record<ByokProvider, string>>>;
}

export interface IntentRoute {
  readonly modelId: string;
  readonly label: string;
  readonly substituted: boolean;
}

const AGGREGATOR: ByokProvider = 'openrouter';

/** Capability order per intent; a route runs only while the catalog prices its id, so a declared-but-unpriced route is inert. */
export const BYOK_INTENT_CANDIDATES: Readonly<
  Record<ModelIntent, readonly CanonicalModel[]>
> = {
  fast: [
    {
      slug: 'anthropic/claude-haiku-4.5',
      label: 'Haiku 4.5',
      routes: {
        anthropic: 'anthropic:claude-haiku-4-5',
        openrouter: 'openrouter:anthropic/claude-haiku-4.5',
      },
    },
    {
      slug: 'openai/gpt-5.6-luna',
      label: 'GPT-5.6 Luna',
      routes: {
        openai: 'openai:gpt-5.6-luna',
        openrouter: 'openrouter:openai/gpt-5.6-luna',
      },
    },
    {
      slug: 'google/gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash Lite',
      routes: {
        google: 'google:gemini-3.5-flash-lite',
        openrouter: 'openrouter:google/gemini-3.5-flash-lite',
      },
    },
  ],
  balanced: [
    {
      slug: 'anthropic/claude-sonnet-5',
      label: 'Sonnet 5',
      routes: {
        anthropic: 'anthropic:claude-sonnet-5',
        openrouter: 'openrouter:anthropic/claude-sonnet-5',
      },
    },
    {
      slug: 'openai/gpt-5.6-terra',
      label: 'GPT-5.6 Terra',
      routes: {
        openai: 'openai:gpt-5.6-terra',
        openrouter: 'openrouter:openai/gpt-5.6-terra',
      },
    },
    {
      slug: 'google/gemini-3.7-flash',
      label: 'Gemini 3.7 Flash',
      routes: {
        google: 'google:gemini-3.7-flash',
        openrouter: 'openrouter:google/gemini-3.7-flash',
      },
    },
    {
      slug: 'anthropic/claude-sonnet-4.6',
      label: 'Sonnet 4.6',
      routes: { openrouter: 'openrouter:anthropic/claude-sonnet-4.6' },
    },
  ],
  powerful: [
    {
      slug: 'anthropic/claude-opus-5',
      label: 'Opus 5',
      routes: {
        anthropic: 'anthropic:claude-opus-5',
        openrouter: 'openrouter:anthropic/claude-opus-5',
      },
    },
    {
      slug: 'openai/gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      routes: {
        openai: 'openai:gpt-5.6-sol',
        openrouter: 'openrouter:openai/gpt-5.6-sol',
      },
    },
    {
      slug: 'google/gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro',
      routes: {
        google: 'google:gemini-3.1-pro-preview',
        openrouter: 'openrouter:google/gemini-3.1-pro-preview',
      },
    },
  ],
};

const CANDIDATES: readonly CanonicalModel[] = Object.values(
  BYOK_INTENT_CANDIDATES
).flat();

export function canonicalOf(modelId: string): CanonicalModel | undefined {
  return CANDIDATES.find((candidate) =>
    Object.values(candidate.routes).includes(modelId)
  );
}

export function effectivePrimary(
  held: readonly ByokProvider[]
): ByokProvider | null {
  return held[0] ?? null;
}

function routeOrder(
  held: readonly ByokProvider[],
  primary: ByokProvider | null
): ByokProvider[] {
  const rest = held.filter((provider) => provider !== primary);
  return [
    ...(primary !== null && held.includes(primary) ? [primary] : []),
    ...rest.filter((provider) => provider !== AGGREGATOR),
    ...rest.filter((provider) => provider === AGGREGATOR),
  ];
}

/**
 * The first candidate any held key can serve wins; the primary provider only
 * picks which of that candidate's routes runs. Never a platform model.
 */
export function routeIntent(
  candidates: readonly CanonicalModel[],
  held: readonly ByokProvider[],
  primary: ByokProvider | null,
  isSupported: (modelId: string) => boolean
): IntentRoute | null {
  const order = routeOrder(held, primary);
  for (const candidate of candidates) {
    for (const provider of order) {
      const modelId = candidate.routes[provider];
      if (modelId !== undefined && isSupported(modelId)) {
        return {
          modelId,
          label: candidate.label,
          substituted: provider !== primary,
        };
      }
    }
  }
  return null;
}
