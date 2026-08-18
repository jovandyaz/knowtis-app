import type { CatalogModel } from '@knowtis/data-access-admin';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

/** Mirrors the server's access policy, where a negative stored price is a broken row rather than a discount. */
export function isByokOnly(model: CatalogModel): boolean {
  return (
    model.outputCostPerToken < 0 ||
    model.outputCostPerToken > FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
  );
}
