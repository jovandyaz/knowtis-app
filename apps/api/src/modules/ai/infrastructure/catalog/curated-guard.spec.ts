import { describe, expect, it } from 'vitest';

import { MODEL_INDEX_SNAPSHOT, ModelIndexCatalog } from '@knowtis/ai-gateway';

import { unservedFloorModels } from '../../domain/model-catalog/floor-models';

describe('vendored model index snapshot', () => {
  it('supports, fully prices and sizes the input window of every floor model', () => {
    expect(
      unservedFloorModels(new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT))
    ).toEqual([]);
  });
});
