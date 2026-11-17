import type { IndexedModel } from '@jovandyaz/llm-router';

import { BYOK_PROVIDERS, MODEL_INTENTS } from '@knowtis/shared-types';

import {
  resolveByokIntent,
  resolvePlatformIntent,
} from '../domain/model-catalog/model-selectors';

/** The row each platform intent resolves to over `rows` at `now`, in `MODEL_INTENTS` order; throws when one resolves none. */
export function platformFloorRowsOf(
  rows: readonly IndexedModel[],
  now: Date
): IndexedModel[] {
  return MODEL_INTENTS.map((intent) => {
    const row = resolvePlatformIntent(intent, rows, now);
    if (row === null) {
      throw new Error(`the index resolves no platform ${intent} model`);
    }
    return row;
  });
}

/** The row each platform intent and each BYOK intent route resolves to over `rows` at `now`, each passed through `override`. */
export function floorRowsOf(
  rows: readonly IndexedModel[],
  now: Date,
  override: (row: IndexedModel) => IndexedModel = (row) => row
): IndexedModel[] {
  const routes = BYOK_PROVIDERS.flatMap((provider) =>
    MODEL_INTENTS.flatMap((intent) => {
      const route = resolveByokIntent(intent, provider, rows, now);
      return route === null ? [] : [route];
    })
  );
  return [...platformFloorRowsOf(rows, now), ...routes].map(override);
}
