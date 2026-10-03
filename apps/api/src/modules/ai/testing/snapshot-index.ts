import { ModelIndexCache } from '../infrastructure/catalog/model-index.cache';
import { createModelIndexRepositoryStub } from './create-model-index-repository-stub';

/** The date the vendored model index snapshot's selector resolutions are pinned to. */
export const SNAPSHOT_DATE = new Date('2026-10-03T00:00:00Z');

/** A model index cache that serves the vendored snapshot floor, as before its first refresh. */
export function createSnapshotIndex(): ModelIndexCache {
  return new ModelIndexCache(createModelIndexRepositoryStub(async () => []));
}
