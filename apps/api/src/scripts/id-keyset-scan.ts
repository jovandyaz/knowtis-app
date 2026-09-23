export const SCAN_BATCH_SIZE = 100;

export interface KeysetSource<T extends { readonly id: string }> {
  statesAfter(id: string | null, limit: number): Promise<readonly T[]>;
}

/** Every row of `source` in id order, read {@link SCAN_BATCH_SIZE} at a time after the last id returned. */
export async function* scanById<T extends { readonly id: string }>(
  source: KeysetSource<T>
): AsyncGenerator<T> {
  let after: string | null = null;
  for (;;) {
    const batch = await source.statesAfter(after, SCAN_BATCH_SIZE);
    const last = batch.at(-1);
    if (!last) {
      return;
    }
    yield* batch;
    after = last.id;
  }
}
