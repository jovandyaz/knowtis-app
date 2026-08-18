import type { AiConfigEntry, CatalogModel } from '@knowtis/data-access-admin';
import {
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  TOKENS_PER_MILLION,
} from '@knowtis/shared-types';

const CEILING_KEY = 'ai_free_tier_ceiling';

/** Mirrors the server's access policy, where a negative stored price is a broken row rather than a discount. */
export function isByokOnly(
  model: CatalogModel,
  maxOutputCostPerToken: number
): boolean {
  return (
    model.outputCostPerToken < 0 ||
    model.outputCostPerToken > maxOutputCostPerToken
  );
}

/**
 * Reads the operator's free-tier ceiling out of the effective AI config as a
 * per-token rate. Falls back to the code default when the entry is absent — an
 * API that predates the key — or when its value does not parse, so the badge
 * degrades to the shipped policy instead of claiming everything is free.
 */
export function freeTierCeilingFrom(
  entries: readonly AiConfigEntry[] | undefined
): number {
  const value = entries?.find((entry) => entry.key === CEILING_KEY)?.value;
  if (value === undefined) {
    return FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN;
  }
  const usdPerMillion = Number(value);
  if (!Number.isFinite(usdPerMillion) || usdPerMillion < 0) {
    return FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN;
  }
  return usdPerMillion / TOKENS_PER_MILLION;
}
