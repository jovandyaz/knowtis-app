import { MODEL_INDEX_SNAPSHOT_DATE } from '@jovandyaz/llm-router';

import { ModelIndexCache } from '../infrastructure/catalog/model-index.cache';
import { createModelIndexRepositoryStub } from './create-model-index-repository-stub';

/** UTC midnight of the day the vendored model index snapshot was generated: the date its selector resolutions are pinned to. */
export const SNAPSHOT_DATE = new Date(MODEL_INDEX_SNAPSHOT_DATE);

/** A model index cache that serves the vendored snapshot floor, as before its first refresh. */
export function createSnapshotIndex(): ModelIndexCache {
  return new ModelIndexCache(createModelIndexRepositoryStub(async () => []));
}
