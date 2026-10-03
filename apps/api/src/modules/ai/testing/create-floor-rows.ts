import type { IndexedModel } from '@knowtis/ai-gateway';

import { FLOOR_MODEL_IDS } from '../domain/model-catalog/floor-models';
import { createIndexedModel } from './create-indexed-model';

/** One served index row per floor model, each passed through `override`. */
export function createFloorRows(
  override: (row: IndexedModel) => IndexedModel = (row) => row
): IndexedModel[] {
  return FLOOR_MODEL_IDS.map((id) => override(createIndexedModel({ id })));
}
