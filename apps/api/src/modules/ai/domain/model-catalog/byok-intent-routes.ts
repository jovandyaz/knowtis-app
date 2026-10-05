import type { IndexedModel } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  BYOK_SELECTORS,
  resolveSelector,
  type ModelSelector,
} from './model-selectors';

/** One selector's resolution on each provider that serves its author: its direct provider and OpenRouter. */
export interface SelectorRoutes {
  readonly selector: ModelSelector;
  readonly routes: Readonly<Partial<Record<ByokProvider, IndexedModel>>>;
}

export type ByokResolutions = Readonly<
  Record<ModelIntent, readonly SelectorRoutes[]>
>;

export interface IntentRoute {
  readonly row: IndexedModel;
  readonly substituted: boolean;
}

const AGGREGATOR: ByokProvider = 'openrouter';

function resolveIntentSelectors(
  intent: ModelIntent,
  rows: readonly IndexedModel[],
  now: Date
): SelectorRoutes[] {
  return BYOK_SELECTORS[intent].map((selector) => {
    const routes: Partial<Record<ByokProvider, IndexedModel>> = {};
    for (const provider of BYOK_PROVIDERS) {
      const row = resolveSelector(selector, provider, rows, now);
      if (row !== null) {
        routes[provider] = row;
      }
    }
    return { selector, routes };
  });
}

/** Every BYOK selector of each intent, in selector order, resolved over `rows` at `now`. */
export function resolveByokSelectors(
  rows: readonly IndexedModel[],
  now: Date
): ByokResolutions {
  return {
    fast: resolveIntentSelectors('fast', rows, now),
    balanced: resolveIntentSelectors('balanced', rows, now),
    powerful: resolveIntentSelectors('powerful', rows, now),
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

/** Each candidate with only the routes `isEntitled` keeps; a candidate left without routes stays, so selector order is unchanged. */
export function entitledRoutes(
  candidates: readonly SelectorRoutes[],
  isEntitled: (row: IndexedModel) => boolean
): SelectorRoutes[] {
  return candidates.map(({ selector, routes }) => {
    const kept: Partial<Record<ByokProvider, IndexedModel>> = {};
    for (const provider of BYOK_PROVIDERS) {
      const row = routes[provider];
      if (row !== undefined && isEntitled(row)) {
        kept[provider] = row;
      }
    }
    return { selector, routes: kept };
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
