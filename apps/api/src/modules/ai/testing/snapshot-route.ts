import { MODEL_INDEX_SNAPSHOT } from '@knowtis/ai-gateway';
import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

import { resolveByokIntent } from '../domain/model-catalog/model-selectors';
import { SNAPSHOT_DATE } from './snapshot-index';

/** The id of the route `provider` serves `intent` on over the vendored snapshot at `SNAPSHOT_DATE`; throws when it serves none. */
export function snapshotRouteId(
  intent: ModelIntent,
  provider: ByokProvider
): string {
  const row = resolveByokIntent(
    intent,
    provider,
    MODEL_INDEX_SNAPSHOT,
    SNAPSHOT_DATE
  );
  if (row === null) {
    throw new Error(`no ${intent} route on ${provider}`);
  }
  return row.id;
}
