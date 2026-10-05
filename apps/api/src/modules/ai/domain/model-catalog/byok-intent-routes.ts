import type { IndexedModel } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  BYOK_SELECTORS,
  rankSelector,
  type ModelSelector,
} from './model-selectors';

/** One selector's eligible rows, newest first, on each provider that serves its author: its direct provider and OpenRouter. A provider ranking nothing is absent. */
export interface SelectorCandidates {
  readonly selector: ModelSelector;
  readonly ranked: Readonly<
    Partial<Record<ByokProvider, readonly IndexedModel[]>>
  >;
}

/** One selector's route on each provider that serves it. */
export interface SelectorRoutes {
  readonly selector: ModelSelector;
  readonly routes: Readonly<Partial<Record<ByokProvider, IndexedModel>>>;
}

export type ByokResolutions = Readonly<
  Record<ModelIntent, readonly SelectorCandidates[]>
>;

export interface IntentRoute {
  readonly row: IndexedModel;
  readonly substituted: boolean;
}

const AGGREGATOR: ByokProvider = 'openrouter';

function rankIntentSelectors(
  intent: ModelIntent,
  rows: readonly IndexedModel[],
  now: Date
): SelectorCandidates[] {
  return BYOK_SELECTORS[intent].map((selector) => {
    const ranked: Partial<Record<ByokProvider, readonly IndexedModel[]>> = {};
    for (const provider of BYOK_PROVIDERS) {
      const onProvider = rankSelector(selector, provider, rows, now);
      if (onProvider.length > 0) {
        ranked[provider] = onProvider;
      }
    }
    return { selector, ranked };
  });
}

/** Every BYOK selector of each intent, in selector order, ranked over `rows` at `now`. */
export function resolveByokSelectors(
  rows: readonly IndexedModel[],
  now: Date
): ByokResolutions {
  return {
    fast: rankIntentSelectors('fast', rows, now),
    balanced: rankIntentSelectors('balanced', rows, now),
    powerful: rankIntentSelectors('powerful', rows, now),
  };
}

/** The stored primary while its key is held, else the first key added. */
export function effectivePrimary(
  held: readonly ByokProvider[],
  stored: ByokProvider | null
): ByokProvider | null {
  return stored !== null && held.includes(stored) ? stored : (held[0] ?? null);
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

/** Each candidate routed on each provider to its newest row `isEntitled` keeps; a provider with none is dropped, and a candidate left without routes stays, so selector order is unchanged. */
export function entitledRoutes(
  candidates: readonly SelectorCandidates[],
  isEntitled: (row: IndexedModel) => boolean
): SelectorRoutes[] {
  return candidates.map(({ selector, ranked }) => {
    const routes: Partial<Record<ByokProvider, IndexedModel>> = {};
    for (const provider of BYOK_PROVIDERS) {
      const row = ranked[provider]?.find(isEntitled);
      if (row !== undefined) {
        routes[provider] = row;
      }
    }
    return { selector, routes };
  });
}

/** Every route the held keys reach: candidates in selector order, each candidate's routes in route order (primary, other direct keys in add order, OpenRouter last). */
export function reachableRoutes(
  candidates: readonly SelectorRoutes[],
  held: readonly ByokProvider[],
  primary: ByokProvider | null
): IndexedModel[] {
  const order = routeOrder(held, primary);
  return candidates.flatMap((candidate) =>
    order.flatMap((provider) => candidate.routes[provider] ?? [])
  );
}

/**
 * The first candidate any held key can serve wins; the primary provider only
 * picks which of its routes runs. Never a platform model.
 */
export function routeIntent(
  candidates: readonly SelectorRoutes[],
  held: readonly ByokProvider[],
  primary: ByokProvider | null
): IntentRoute | null {
  const row = reachableRoutes(candidates, held, primary)[0];
  return row === undefined
    ? null
    : { row, substituted: row.provider !== primary };
}
