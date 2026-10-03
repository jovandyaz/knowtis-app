import type { IndexedModel, IndexProvider } from '@knowtis/ai-gateway';

/** Fewest rows a provider's batch may carry, as a share of its previously listed rows, and still retire the rows it no longer lists. */
export const SYNC_MAX_SHRINK_RATIO = 0.5;

type AbsenceRejection = 'shrink' | 'inconclusive';

/** One provider's rows from one sync pass. `conclusive` is false when the read may have missed rows that still exist upstream. */
export interface ProviderBatch {
  readonly provider: IndexProvider;
  readonly rows: readonly IndexedModel[];
  readonly conclusive: boolean;
  /** Index ids upstream published that `rows` leaves out: not gone, so never marked absent. */
  readonly discarded: readonly string[];
}

export interface IndexSyncPlan {
  readonly upserts: readonly IndexedModel[];
  /** Providers whose missing rows may be marked absent. */
  readonly concludeAbsence: readonly IndexProvider[];
  readonly rejected: readonly {
    provider: IndexProvider;
    reason: AbsenceRejection;
  }[];
}

function absenceRejection(
  batch: ProviderBatch,
  previous: number
): AbsenceRejection | null {
  if (previous === 0) {
    return null;
  }
  if (!batch.conclusive) {
    return 'inconclusive';
  }
  return batch.rows.length >= previous * SYNC_MAX_SHRINK_RATIO
    ? null
    : 'shrink';
}

/**
 * Decides what one sync pass writes. Every seen row is upserted, even from a
 * rejected batch. A provider retires its missing rows only when its batch is
 * conclusive and did not shrink past `SYNC_MAX_SHRINK_RATIO`, or when none of
 * its rows were listed before; a provider without a batch is left untouched.
 *
 * `previousListed` is the provider's listed-row count before this pass.
 */
export function planIndexSync(
  batches: readonly ProviderBatch[],
  previousListed: Readonly<Record<IndexProvider, number>>
): IndexSyncPlan {
  const concludeAbsence: IndexProvider[] = [];
  const rejected: IndexSyncPlan['rejected'][number][] = [];

  for (const batch of batches) {
    const reason = absenceRejection(batch, previousListed[batch.provider]);
    if (reason === null) {
      concludeAbsence.push(batch.provider);
    } else {
      rejected.push({ provider: batch.provider, reason });
    }
  }

  return {
    upserts: batches.flatMap((batch) => batch.rows),
    concludeAbsence,
    rejected,
  };
}
