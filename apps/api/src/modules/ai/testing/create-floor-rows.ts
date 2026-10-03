import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';
import { BYOK_PROVIDERS, MODEL_INTENTS } from '@knowtis/shared-types';

import { PLATFORM_FLOOR_MODEL_IDS } from '../domain/model-catalog/floor-models';
import { resolveByokIntent } from '../domain/model-catalog/model-selectors';
import { createIndexedModel } from './create-indexed-model';
import { SNAPSHOT_DATE } from './snapshot-index';

/** One served index row per platform floor model, plus the snapshot row each BYOK intent route resolves to at `SNAPSHOT_DATE`, each passed through `override`. */
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
  return [
    ...PLATFORM_FLOOR_MODEL_IDS.map((id) => createIndexedModel({ id })),
    ...routes,
  ].map(override);
}
