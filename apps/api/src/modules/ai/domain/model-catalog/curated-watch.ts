import { toLiteLLMKey } from '@knowtis/ai-gateway';
import type { CatalogAlertKind, ModelTier } from '@knowtis/shared-types';

import type { UpstreamModel } from '../ports/openrouter-models.port';
import {
  CURATED_MODELS,
  OPENROUTER_ID_PREFIX,
} from './selectable-models.catalog';

export interface DriftFinding {
  modelId: string;
  kind: CatalogAlertKind;
  detail: string;
}

/** The fields this watch reads out of a LiteLLM price entry; every other field upstream publishes is ignored. */
export interface LiteLlmPriceEntry {
  output_cost_per_token?: number | undefined;
  deprecation_date?: string | undefined;
}

const OPEN_TIER: ModelTier = 'open';

/** Relative gap above which the vendored snapshot and live LiteLLM differ for real rather than by floating-point noise. */
const LITELLM_PRICE_DRIFT_RATIO = 0.001;

/** OpenRouter routes across providers, so its price and the vendored list rate legitimately differ; only a wide gap upward means the vendored cost stopped covering what we pay. */
const OPENROUTER_PRICE_DRIFT_RATIO = 0.2;

const ISO_DATE_LENGTH = 10;
const TOKENS_PER_MILLION = 1_000_000;
const PRICE_DECIMALS = 2;

const OPEN_TIER_SLUGS: ReadonlyMap<string, string> = new Map(
  CURATED_MODELS.filter(
    (model) =>
      model.tier === OPEN_TIER && model.id.startsWith(OPENROUTER_ID_PREFIX)
  ).map((model) => [model.id, model.id.slice(OPENROUTER_ID_PREFIX.length)])
);

/** The OpenRouter slug behind a curated open-tier id, or null when that model is billed elsewhere or is not curated. */
export function openTierSlug(curatedId: string): string | null {
  return OPEN_TIER_SLUGS.get(curatedId) ?? null;
}

function hasPriceDrift(vendored: number, live: number, ratio: number): boolean {
  if (vendored === 0) {
    return live !== 0;
  }
  return Math.abs(live - vendored) / vendored > ratio;
}

/**
 * Whether the live price outgrew the vendored one. Only that direction is an
 * incident: the open-tier vendored costs are deliberate upper bounds over
 * OpenRouter's routed providers, so a cheaper upstream is the expected state.
 */
function exceedsVendored(
  vendored: number,
  live: number,
  ratio: number
): boolean {
  if (vendored === 0) {
    return live > 0;
  }
  return (live - vendored) / vendored > ratio;
}

function perMillionTokens(costPerToken: number): string {
  return (costPerToken * TOKENS_PER_MILLION).toFixed(PRICE_DECIMALS);
}

/**
 * Upstream changes on the curated models OpenRouter bills, matched by slug.
 * An empty `upstream` yields nothing: absence cannot be concluded from an empty
 * universe, and a truncated payload would otherwise alert on every model at once.
 */
export function findOpenRouterDrift(
  vendoredOutputCost: (id: string) => number | undefined,
  upstream: readonly UpstreamModel[]
): DriftFinding[] {
  if (upstream.length === 0) {
    return [];
  }
  const bySlug = new Map(upstream.map((model) => [model.id, model]));
  const findings: DriftFinding[] = [];

  for (const model of CURATED_MODELS) {
    const slug = openTierSlug(model.id);
    if (slug === null) {
      continue;
    }
    const live = bySlug.get(slug);
    if (live === undefined) {
      findings.push({
        modelId: model.id,
        kind: 'unavailable',
        detail: `OpenRouter no longer lists ${slug}; turns routed to this model fail at the provider`,
      });
      continue;
    }

    if (live.expirationDate !== null) {
      findings.push({
        modelId: model.id,
        kind: 'deprecation',
        detail: `OpenRouter lists expiration ${live.expirationDate.toISOString().slice(0, ISO_DATE_LENGTH)}`,
      });
    }

    const vendored = vendoredOutputCost(model.id);
    if (
      vendored !== undefined &&
      exceedsVendored(
        vendored,
        live.completionCostPerToken,
        OPENROUTER_PRICE_DRIFT_RATIO
      )
    ) {
      findings.push({
        modelId: model.id,
        kind: 'price_drift',
        detail: `OpenRouter output cost $${perMillionTokens(live.completionCostPerToken)}/M vs vendored $${perMillionTokens(vendored)}/M`,
      });
    }
  }

  return findings;
}

/**
 * Upstream changes on the curated models we bill through LiteLLM pricing.
 *
 * Open-tier models are skipped: OpenRouter, not LiteLLM, is the source we bill
 * them from, so a LiteLLM entry for one would only produce false positives.
 */
export function findLiteLlmDrift(
  vendoredOutputCost: (id: string) => number | undefined,
  live: Record<string, LiteLlmPriceEntry>
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  for (const model of CURATED_MODELS) {
    if (openTierSlug(model.id) !== null) {
      continue;
    }
    const liteLlmKey = toLiteLLMKey(model.id);
    if (liteLlmKey === undefined) {
      continue;
    }
    const entry = live[liteLlmKey];
    if (entry === undefined) {
      continue;
    }

    if (entry.deprecation_date) {
      findings.push({
        modelId: model.id,
        kind: 'deprecation',
        detail: `LiteLLM reports deprecation_date ${entry.deprecation_date}`,
      });
    }

    const vendored = vendoredOutputCost(model.id);
    const upstream = entry.output_cost_per_token;
    if (
      vendored !== undefined &&
      upstream !== undefined &&
      hasPriceDrift(vendored, upstream, LITELLM_PRICE_DRIFT_RATIO)
    ) {
      findings.push({
        modelId: model.id,
        kind: 'price_drift',
        detail: `LiteLLM output cost per token moved from ${vendored} to ${upstream}`,
      });
    }
  }

  return findings;
}
