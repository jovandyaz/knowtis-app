import { toLiteLLMKey } from '@knowtis/ai-gateway';
import type { CatalogAlertKind, ModelTier } from '@knowtis/shared-types';

import {
  CURATED_MODELS,
  OPENROUTER_ID_PREFIX,
} from './selectable-models.catalog';

export interface DriftFinding {
  modelId: string;
  kind: CatalogAlertKind;
  detail: string;
}

interface LiteLlmEntry {
  output_cost_per_token?: number;
  deprecation_date?: string;
}

const OPEN_TIER: ModelTier = 'open';

/** Relative gap above which two prices are a real change rather than floating-point noise. */
const PRICE_DRIFT_TOLERANCE = 0.001;

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

function hasPriceDrift(vendored: number, live: number): boolean {
  if (vendored === 0) {
    return live !== 0;
  }
  return Math.abs(live - vendored) / vendored > PRICE_DRIFT_TOLERANCE;
}

/**
 * Upstream changes on the curated models we bill through LiteLLM pricing.
 *
 * Open-tier models are skipped: OpenRouter, not LiteLLM, is the source we bill
 * them from, so a LiteLLM entry for one would only produce false positives.
 */
export function findLiteLlmDrift(
  vendoredOutputCost: (id: string) => number | undefined,
  live: Record<string, LiteLlmEntry>
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
      hasPriceDrift(vendored, upstream)
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
