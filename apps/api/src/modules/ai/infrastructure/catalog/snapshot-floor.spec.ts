import { describe, expect, it } from 'vitest';

import { MODEL_INDEX_SNAPSHOT, ModelIndexCatalog } from '@knowtis/ai-gateway';

import { unservedFloorModels } from '../../domain/model-catalog/floor-models';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';

describe('vendored model index snapshot', () => {
  it('supports, fully prices and sizes the input window of every platform floor model and the resolution of every BYOK intent route', () => {
    expect(
      unservedFloorModels(
        new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT),
        SNAPSHOT_DATE
      )
    ).toEqual([]);
  });
});
