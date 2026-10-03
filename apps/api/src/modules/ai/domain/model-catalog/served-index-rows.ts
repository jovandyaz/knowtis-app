import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';

/** The rows the index serves: each provider's listed rows, or its vendored snapshot rows while it lists none. A provider's listed rows replace its snapshot rows entirely. */
export function servedIndexRows(
  listed: readonly IndexedModel[]
): IndexedModel[] {
  const synced = new Set(listed.map((row) => row.provider));
  return [
    ...MODEL_INDEX_SNAPSHOT.filter((row) => !synced.has(row.provider)),
    ...listed,
  ];
}
