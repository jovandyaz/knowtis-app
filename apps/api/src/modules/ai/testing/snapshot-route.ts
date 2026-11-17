import type { IndexedModel } from '@jovandyaz/llm-router';

import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

import { resolveByokIntent } from '../domain/model-catalog/model-selectors';

/** The id of the route `provider` serves `intent` on over `rows` at `now`; throws when it serves none. */
export function routeIdOf(
  intent: ModelIntent,
  provider: ByokProvider,
  rows: readonly IndexedModel[],
  now: Date
): string {
  const row = resolveByokIntent(intent, provider, rows, now);
  if (row === null) {
    throw new Error(`no ${intent} route on ${provider}`);
  }
  return row.id;
}
