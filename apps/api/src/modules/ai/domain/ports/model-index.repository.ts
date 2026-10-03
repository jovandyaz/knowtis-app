import type { IndexedModel, IndexProvider } from '@knowtis/ai-gateway';

export const MODEL_INDEX_REPOSITORY = Symbol('MODEL_INDEX_REPOSITORY');

export interface ModelIndexRepository {
  /** Upserts every row, stamping `last_seen_at = seenAt` and clearing `absent_since`. */
  upsertMany(rows: readonly IndexedModel[], seenAt: Date): Promise<number>;
  /** Marks rows of `provider` not seen at `seenAt` absent, except the ids in `keep` (keeps an existing `absent_since`). Returns the count newly marked. */
  markAbsent(
    provider: IndexProvider,
    seenAt: Date,
    keep: readonly string[]
  ): Promise<number>;
  /** Rows with `absent_since` null. */
  listListed(): Promise<IndexedModel[]>;
  countListedByProvider(): Promise<Readonly<Record<IndexProvider, number>>>;
}
