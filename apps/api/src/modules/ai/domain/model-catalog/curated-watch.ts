import type { CatalogAlertKind, ModelTier } from '@knowtis/shared-types';

import type { UpstreamCatalog } from '../ports/openrouter-models.port';
import {
  CURATED_MODELS,
  OPENROUTER_ID_PREFIX,
} from './selectable-models.catalog';
import { UNPARSEABLE_MODEL_ID } from './upstream-discards';

export interface DriftFinding {
  modelId: string;
  kind: CatalogAlertKind;
  detail: string;
}

const OPEN_TIER: ModelTier = 'open';

const ISO_DATE_LENGTH = 10;

const OPEN_TIER_SLUGS: ReadonlyMap<string, string> = new Map(
  CURATED_MODELS.filter(
    (model) =>
      model.tier === OPEN_TIER && model.id.startsWith(OPENROUTER_ID_PREFIX)
  ).map((model) => [
    model.id,
    model.id.slice(OPENROUTER_ID_PREFIX.length).toLowerCase(),
  ])
);

/** The OpenRouter slug behind a curated open-tier id, or null when that model is billed elsewhere or is not curated. */
export function openTierSlug(curatedId: string): string | null {
  return OPEN_TIER_SLUGS.get(curatedId) ?? null;
}

function unavailableDetail(slug: string): string {
  return `OpenRouter no longer lists ${slug}; turns routed to this model fail at the provider`;
}

/**
 * Slug lookup for one upstream read, plus the guard that decides whether it may
 * retire anything: only a catalog that reached the last page, still lists a
 * curated model, and carries no anonymous discard can prove absence — a
 * discarded entry whose id failed to parse could be any model, including the
 * one about to be declared gone.
 */
function absenceCheck(catalog: UpstreamCatalog) {
  const bySlug = new Map(
    catalog.models.map((model) => [model.id.toLowerCase(), model])
  );
  const unparseable = new Set(catalog.discarded.map((id) => id.toLowerCase()));
  const recognizable = CURATED_MODELS.some((model) => {
    const slug = openTierSlug(model.id);
    return slug !== null && bySlug.has(slug);
  });
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

/** Upstream changes on the curated models OpenRouter bills, matched by slug: a model it stopped listing or dates for expiration. */
export function findOpenRouterDrift(catalog: UpstreamCatalog): DriftFinding[] {
  const { bySlug, isGone } = absenceCheck(catalog);
  const findings: DriftFinding[] = [];

  for (const model of CURATED_MODELS) {
    const slug = openTierSlug(model.id);
    if (slug === null) {
      continue;
    }
    const live = bySlug.get(slug);
    if (live === undefined) {
      if (isGone(slug)) {
        findings.push({
          modelId: model.id,
          kind: 'unavailable',
          detail: unavailableDetail(slug),
        });
      }
      continue;
    }

    if (live.expirationDate !== null) {
      findings.push({
        modelId: model.id,
        kind: 'deprecation',
        detail: `OpenRouter lists expiration ${live.expirationDate.toISOString().slice(0, ISO_DATE_LENGTH)}`,
      });
    }
  }

  return findings;
}

/**
 * Promoted models OpenRouter stopped listing. Absence is read from the payload
 * rather than from `lastSeenAt`, which only refreshes for rows still passing the
 * candidate filter — a promoted model whose price outgrew that ceiling is still
 * listed, and reporting it as vanished would be wrong.
 */
export function findPromotedDrift(
  promotedIds: readonly string[],
  catalog: UpstreamCatalog
): DriftFinding[] {
  const { isGone } = absenceCheck(catalog);

  return promotedIds
    .filter((id) => id.startsWith(OPENROUTER_ID_PREFIX))
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
