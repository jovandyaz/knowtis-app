import {
  ModelIndexCatalog,
  type IndexedModel,
  type IndexProvider,
} from '@knowtis/ai-gateway';

import { floorModelsLost } from './floor-models';

/** Fewest rows a provider's batch may carry, as a share of its `previousRowCount`, and still retire the rows it no longer lists. */
export const SYNC_MAX_SHRINK_RATIO = 0.5;

type AbsenceRejection = 'shrink' | 'inconclusive';

/** Why a provider's batch retires nothing. A `floor` rejection also writes none of its rows, and names the floor models and BYOK route keys the batch would leave unserved. */
export type SyncRejection =
  | { readonly provider: IndexProvider; readonly reason: AbsenceRejection }
  | {
      readonly provider: IndexProvider;
      readonly reason: 'floor';
      readonly models: readonly string[];
    };

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
  readonly rejected: readonly SyncRejection[];
}

/**
 * The rows a provider's batch is held to: its listed rows, or, while it lists
 * none, the rows the index serves in their place (its vendored snapshot rows),
 * so a first sync never concludes absence from a read far smaller than the
 * catalog.
 */
export function previousRowCount(
  provider: IndexProvider,
  listed: readonly IndexedModel[],
  served: readonly IndexedModel[]
): number {
  const listedCount = listed.filter((row) => row.provider === provider).length;
  return listedCount > 0
    ? listedCount
    : served.filter((row) => row.provider === provider).length;
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

function floorLost(
  batch: ProviderBatch,
  listedRows: readonly IndexedModel[],
  served: readonly IndexedModel[]
): string[] {
  const discarded = new Set(batch.discarded);
  return floorModelsLost(
    new ModelIndexCatalog(
      served.filter((row) => row.provider === batch.provider)
    ),
    new ModelIndexCatalog([
      ...listedRows.filter((row) => discarded.has(row.id)),
      ...batch.rows,
    ])
  );
}

/**
 * Decides what one sync pass writes. A batch that would leave unserved a floor
 * model or BYOK intent route its provider serves now is rejected whole: none
 * of its rows are written and it retires nothing. It is judged by what the
 * write leaves served: its rows plus the listed rows of its discarded ids,
 * which are kept. Every row of any other batch is upserted. A provider
 * retires its missing rows only when its batch is conclusive and did not
 * shrink past `SYNC_MAX_SHRINK_RATIO` of its `previousRowCount`, or when that
 * count is zero; a provider without a batch is left untouched.
 *
 * `listed` holds the index's listed rows before this pass, and `served` the
 * rows it serves before it (`servedIndexRows(listed)`).
 */
export function planIndexSync(
  batches: readonly ProviderBatch[],
  listed: readonly IndexedModel[],
  served: readonly IndexedModel[]
): IndexSyncPlan {
  const upserts: IndexedModel[] = [];
  const concludeAbsence: IndexProvider[] = [];
  const rejected: SyncRejection[] = [];

  for (const batch of batches) {
    const listedRows = listed.filter((row) => row.provider === batch.provider);
    const lost = floorLost(batch, listedRows, served);
    if (lost.length > 0) {
      rejected.push({
        provider: batch.provider,
        reason: 'floor',
        models: lost,
      });
      continue;
    }
    upserts.push(...batch.rows);
    const reason = absenceRejection(
      batch,
      previousRowCount(batch.provider, listedRows, served)
    );
    if (reason === null) {
      concludeAbsence.push(batch.provider);
    } else {
      rejected.push({ provider: batch.provider, reason });
    }
  }

  return { upserts, concludeAbsence, rejected };
}
