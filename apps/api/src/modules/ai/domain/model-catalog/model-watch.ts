import { OPENROUTER_PROVIDER, type IndexedModel } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  MODEL_INTENTS,
  type CatalogAlertKind,
} from '@knowtis/shared-types';

import { AUTO_MODEL_SETTING } from '../ai-settings';
import { authorOf } from './catalog-model';
import {
  BYOK_SELECTORS,
  isEligible,
  PLATFORM_SELECTORS,
  resolveSelector,
  type ModelSelector,
} from './model-selectors';
import type { ModelResolution } from './platform-resolution';

/** A condition the catalog watch found, as the alert it raises. */
export interface WatchFinding {
  /** What the alert is about: a model id, a selector key, or a provider id, per kind. */
  readonly subject: string;
  readonly kind: CatalogAlertKind;
  readonly detail: string;
}

interface ServedRelease {
  readonly author: string | null;
  readonly releasedAt: string | null;
}

const SYNC_STALE_HOURS = 48;
const MS_PER_HOUR = 3_600_000;

const BYOK_SELECTOR_LIST: readonly ModelSelector[] = MODEL_INTENTS.flatMap(
  (intent) => BYOK_SELECTORS[intent]
);
const SELECTORS: readonly ModelSelector[] = [
  ...BYOK_SELECTOR_LIST,
  ...MODEL_INTENTS.map((intent) => PLATFORM_SELECTORS[intent]),
];
const LISTED_FAMILIES: ReadonlySet<string> = new Set(
  SELECTORS.flatMap((selector) => selector.families)
);

/** Each distinct pinned or chained id the model index does not list; the auto setting pins nothing. */
export function findPinUnavailable(
  pinnedIds: readonly string[],
  listedIds: ReadonlySet<string>
): WatchFinding[] {
  return [...new Set(pinnedIds)]
    .filter((id) => id !== AUTO_MODEL_SETTING && !listedIds.has(id))
    .map(
      (id): WatchFinding => ({
        subject: id,
        kind: 'pin_unavailable',
        detail: `pinned or chained model ${id} is not listed in the model index`,
      })
    );
}

/** Each distinct watched id whose index row carries a retirement date; an id the index lacks is left to the absence watches. */
export function findRetirementScheduled(
  watchedIds: readonly string[],
  rows: readonly IndexedModel[]
): WatchFinding[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [...new Set(watchedIds)].flatMap((id): WatchFinding[] => {
    const retiresAt = byId.get(id)?.retiresAt ?? null;
    return retiresAt === null
      ? []
      : [
          {
            subject: id,
            kind: 'retirement_scheduled',
            detail: `${id} retires on ${retiresAt}`,
          },
        ];
  });
}

// BYOK is not gated, so a BYOK selector's current pick is what it serves.
function servedReleases(
  rows: readonly IndexedModel[],
  resolutions: readonly ModelResolution[],
  now: Date
): ServedRelease[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const platform = resolutions.map(({ activeModelId }) => ({
    author: authorOf(activeModelId),
    releasedAt: byId.get(activeModelId)?.releasedAt ?? null,
  }));
  const byok = BYOK_SELECTOR_LIST.flatMap((selector) =>
    BYOK_PROVIDERS.flatMap(
      (provider) => resolveSelector(selector, provider, rows, now) ?? []
    )
  ).map((row) => ({ author: authorOf(row.id), releasedAt: row.releasedAt }));
  return [...platform, ...byok];
}

function isNewerThanServed(
  row: IndexedModel,
  author: string,
  served: readonly ServedRelease[]
): boolean {
  const { releasedAt } = row;
  return (
    releasedAt !== null &&
    served
      .filter((release) => release.author === author)
      .every(
        (release) =>
          release.releasedAt !== null && releasedAt > release.releasedAt
      )
  );
}

function familyDriftOf(
  row: IndexedModel,
  served: readonly ServedRelease[],
  now: Date
): WatchFinding | null {
  const { family } = row;
  const author = authorOf(row.id);
  if (family === null || author === null || LISTED_FAMILIES.has(family)) {
    return null;
  }
  const eligible = SELECTORS.some(
    (selector) => selector.author === author && isEligible(row, selector, now)
  );
  if (!eligible || !isNewerThanServed(row, author, served)) {
    return null;
  }
  return {
    subject: row.id,
    kind: 'family_drift',
    detail: `new ${family} family from ${author}`,
  };
}

/**
 * Rows a selector of their author would pick but for a family no selector
 * lists, released after every model that author serves (the active platform
 * resolutions and the current BYOK picks): a generation the selectors miss. An
 * author with a served model of unknown release date reports nothing.
 */
export function findFamilyDrift(
  rows: readonly IndexedModel[],
  resolutions: readonly ModelResolution[],
  now: Date
): WatchFinding[] {
  const served = servedReleases(rows, resolutions, now);
  return rows.flatMap((row) => familyDriftOf(row, served, now) ?? []);
}

/** A `sync_stale` finding on OpenRouter unless a listed OpenRouter index row was seen within `SYNC_STALE_HOURS` (48) of `now`; `lastSeenAt` is null when none is listed. */
export function findStaleSync(
  lastSeenAt: Date | null,
  now: Date
): WatchFinding | null {
  if (lastSeenAt === null) {
    return {
      subject: OPENROUTER_PROVIDER,
      kind: 'sync_stale',
      detail: 'the model index lists no OpenRouter model',
    };
  }
  if (now.getTime() - lastSeenAt.getTime() <= SYNC_STALE_HOURS * MS_PER_HOUR) {
    return null;
  }
  return {
    subject: OPENROUTER_PROVIDER,
    kind: 'sync_stale',
    detail: `no listed OpenRouter model seen since ${lastSeenAt.toISOString()}, over ${SYNC_STALE_HOURS} hours ago`,
  };
}
