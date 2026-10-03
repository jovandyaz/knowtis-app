import { MODEL_INDEX_SNAPSHOT, ModelIndexCatalog } from '@knowtis/ai-gateway';

const SNAPSHOT_CATALOG = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);

/** Whether the vendored model index snapshot supports the model. */
export function supportedAtSnapshot(modelId: string): boolean {
  return SNAPSHOT_CATALOG.isSupported(modelId);
}
