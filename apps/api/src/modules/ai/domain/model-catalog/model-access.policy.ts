import { providerOf } from '@knowtis/ai-gateway';
import type { ModelAccess, ModelTier } from '@knowtis/shared-types';

import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from './candidate-filter';
import { CURATED_MODEL_IDS } from './selectable-models.catalog';

const GRANTED: ModelAccess = 'granted';
const REQUIRES_BYOK: ModelAccess = 'requires_byok';
const FREE_TIER: ModelTier = 'open';

/** What the access policy needs to price a model: its tier and what the catalog says a token of output costs. */
export interface AccessCandidate {
  readonly id: string;
  readonly tier: ModelTier;
  /** `null` when the catalog cannot price the model, which is never free. */
  readonly outputCostPerToken: number | null;
}

/**
 * The freemium ladder's single policy point.
 *
 * Tier gating is flag-controlled, and while it is off the hand-curated catalog
 * behaves exactly as it did before the ladder existed: everything granted. The
 * price ceiling is deliberately not flag-controlled for anything else — a row
 * reaches the catalog through a promote button rather than a code review, so
 * the platform never absorbs it above the ceiling no matter its tier.
 */
export function accessFor(
  model: AccessCandidate,
  byokProviders: ReadonlySet<string>,
  tierGatingOn: boolean
): ModelAccess {
  const free = tierGatingOn
    ? model.tier === FREE_TIER && isPlatformAbsorbable(model)
    : CURATED_MODEL_IDS.has(model.id) || isPlatformAbsorbable(model);
  if (free) {
    return GRANTED;
  }
  return byokProviders.has(providerOf(model.id)) ? GRANTED : REQUIRES_BYOK;
}

function isPlatformAbsorbable(model: AccessCandidate): boolean {
  return (
    model.outputCostPerToken !== null &&
    model.outputCostPerToken <= FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
  );
}
