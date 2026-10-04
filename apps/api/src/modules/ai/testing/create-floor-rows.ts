import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';
import { BYOK_PROVIDERS, MODEL_INTENTS } from '@knowtis/shared-types';

import {
  resolveByokIntent,
  resolvePlatformIntent,
} from '../domain/model-catalog/model-selectors';
import { SNAPSHOT_DATE } from './snapshot-index';

/** The snapshot row each platform intent resolves to at `SNAPSHOT_DATE`, in `MODEL_INTENTS` order. */
export const PLATFORM_FLOOR_ROWS: readonly IndexedModel[] = MODEL_INTENTS.map(
  (intent) => {
    const row = resolvePlatformIntent(
      intent,
      MODEL_INDEX_SNAPSHOT,
      SNAPSHOT_DATE
    );
    if (row === null) {
      throw new Error(
        `the vendored snapshot resolves no platform ${intent} model`
      );
    }
    return row;
  }
);

/** The snapshot row each platform intent and each BYOK intent route resolves to at `SNAPSHOT_DATE`, each passed through `override`. */
export function createFloorRows(
  override: (row: IndexedModel) => IndexedModel = (row) => row
): IndexedModel[] {
  const routes = BYOK_PROVIDERS.flatMap((provider) =>
    MODEL_INTENTS.flatMap((intent) => {
      const route = resolveByokIntent(
        intent,
        provider,
        MODEL_INDEX_SNAPSHOT,
        SNAPSHOT_DATE
      );
      return route === null ? [] : [route];
    })
  );
  return [...PLATFORM_FLOOR_ROWS, ...routes].map(override);
}
