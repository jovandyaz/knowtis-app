import { MODEL_INDEX_SNAPSHOT } from '@knowtis/ai-gateway';

import { ModelIndexCache } from '../infrastructure/catalog/model-index.cache';
import { createModelIndexRepositoryStub } from './create-model-index-repository-stub';

/** The date the vendored model index snapshot's selector resolutions are pinned to. */
export const SNAPSHOT_DATE = new Date('2026-10-03T00:00:00Z');

/** A model index cache that serves the vendored snapshot floor, as before its first refresh. */
export function createSnapshotIndex(): ModelIndexCache {
  return new ModelIndexCache(createModelIndexRepositoryStub(async () => []));
}

/** A model index cache refreshed with the vendored snapshot's rows, as after a sync that listed exactly them. */
export async function createSyncedSnapshotIndex(): Promise<ModelIndexCache> {
  const index = new ModelIndexCache(
    createModelIndexRepositoryStub(async () => [...MODEL_INDEX_SNAPSHOT])
  );
  await index.refresh();
  return index;
}
