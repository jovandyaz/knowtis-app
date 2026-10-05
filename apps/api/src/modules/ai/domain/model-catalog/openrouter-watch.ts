import { MODEL_INTENTS, type CatalogAlertKind } from '@knowtis/shared-types';

import type { UpstreamCatalog } from '../ports/openrouter-models.port';
import { isoDateOf } from '../value-objects/utc-day';
import { OPENROUTER_ID_PREFIX } from './catalog-model';
import { PLATFORM_SELECTORS } from './model-selectors';
import { UNPARSEABLE_MODEL_ID } from './upstream-discards';

export interface DriftFinding {
  modelId: string;
  kind: CatalogAlertKind;
  detail: string;
}

/** OpenRouter authors the platform selectors pick from; a read listing none of them is not the catalog we know. */
const PLATFORM_AUTHOR_PREFIXES = [
  ...new Set(
    MODEL_INTENTS.map((intent) => `${PLATFORM_SELECTORS[intent].author}/`)
  ),
];

function watchedSlugs(ids: readonly string[]): ReadonlyMap<string, string> {
  return new Map(
    ids
      .filter((id) => id.startsWith(OPENROUTER_ID_PREFIX))
      .map((id) => [id, id.slice(OPENROUTER_ID_PREFIX.length).toLowerCase()])
  );
}

function unavailableDetail(slug: string): string {
  return `OpenRouter no longer lists ${slug}; turns routed to this model fail at the provider`;
}

/**
 * Slug lookup for one upstream read, plus the guard that decides whether it may
 * retire anything: only a catalog that reached the last page, lists a model by
 * an author the platform selectors pick from, and carries no anonymous discard
 * can prove absence — a discarded entry whose id failed to parse could be any
 * model, including the one about to be declared gone.
 */
function absenceCheck(catalog: UpstreamCatalog) {
  const bySlug = new Map(
    catalog.models.map((model) => [model.id.toLowerCase(), model])
  );
  const unparseable = new Set(catalog.discarded.map((id) => id.toLowerCase()));
  const recognizable = catalog.models.some((model) =>
    PLATFORM_AUTHOR_PREFIXES.some((prefix) =>
      model.id.toLowerCase().startsWith(prefix)
    )
  );
  const conclusive =
    catalog.complete && recognizable && !unparseable.has(UNPARSEABLE_MODEL_ID);

  return {
    bySlug,
    conclusive,
    isGone: (slug: string) =>
      conclusive && !bySlug.has(slug) && !unparseable.has(slug),
  };
}

/** False when this read cannot prove absence, so the vanish watch reports nothing that run — otherwise indistinguishable from a healthy sync. */
export function canConcludeAbsence(catalog: UpstreamCatalog): boolean {
  return absenceCheck(catalog).conclusive;
}

/** Upstream changes on the platform's OpenRouter models, matched by slug: one it stopped listing or dates for expiration. */
export function findOpenRouterDrift(
  catalog: UpstreamCatalog,
  watchedIds: readonly string[]
): DriftFinding[] {
  const { bySlug, isGone } = absenceCheck(catalog);
  const findings: DriftFinding[] = [];

  for (const [modelId, slug] of watchedSlugs(watchedIds)) {
    const live = bySlug.get(slug);
    if (live === undefined) {
      if (isGone(slug)) {
        findings.push({
          modelId,
          kind: 'unavailable',
          detail: unavailableDetail(slug),
        });
      }
      continue;
    }

    if (live.expirationDate !== null) {
      findings.push({
        modelId,
        kind: 'deprecation',
        detail: `OpenRouter lists expiration ${isoDateOf(live.expirationDate)}`,
      });
    }
  }

  return findings;
}

/**
 * Promoted models OpenRouter stopped listing, except watched ones, which
 * `findOpenRouterDrift` reports. Absence is read from the payload rather than
 * from `lastSeenAt`, which only refreshes for rows still passing the candidate
 * filter — a promoted model whose price outgrew that ceiling is still listed,
 * and reporting it as vanished would be wrong.
 */
export function findPromotedDrift(
  promotedIds: readonly string[],
  catalog: UpstreamCatalog,
  watchedIds: readonly string[]
): DriftFinding[] {
  const { isGone } = absenceCheck(catalog);
  const watched = watchedSlugs(watchedIds);

  return promotedIds
    .filter((id) => id.startsWith(OPENROUTER_ID_PREFIX) && !watched.has(id))
    .flatMap((id) => {
      const slug = id.slice(OPENROUTER_ID_PREFIX.length).toLowerCase();
      return isGone(slug)
        ? [
            {
              modelId: id,
              kind: 'unavailable' as const,
              detail: unavailableDetail(slug),
            },
          ]
        : [];
    });
}
