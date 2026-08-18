import { providerOf } from '@knowtis/ai-gateway';
import {
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  type ModelAccess,
  type ModelTier,
} from '@knowtis/shared-types';

import { CURATED_MODEL_IDS } from './selectable-models.catalog';

const GRANTED: ModelAccess = 'granted';
const REQUIRES_BYOK: ModelAccess = 'requires_byok';
const FREE_TIER: ModelTier = 'open';

/** What the access policy needs to price a model: its tier and what the catalog says a token of output costs. */
export interface AccessCandidate {
  readonly id: string;
  readonly tier: ModelTier;
  /** `null` when the catalog cannot price the model. Neither `null` nor a negative price is ever free. */
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
 *
 * `maxOutputCostPerToken` is the operator's ceiling, which admins move from the
 * backoffice; it falls back to the code default so a caller that cannot resolve
 * config still gets the shipped policy rather than an open door.
 */
export function accessFor(
  model: AccessCandidate,
  byokProviders: ReadonlySet<string>,
  tierGatingOn: boolean,
  maxOutputCostPerToken: number = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
): ModelAccess {
  const free = tierGatingOn
    ? model.tier === FREE_TIER &&
      isPlatformAbsorbable(model, maxOutputCostPerToken)
    : CURATED_MODEL_IDS.has(model.id) ||
      isPlatformAbsorbable(model, maxOutputCostPerToken);
  if (free) {
    return GRANTED;
  }
  return byokProviders.has(providerOf(model.id)) ? GRANTED : REQUIRES_BYOK;
}

function isPlatformAbsorbable(
  model: AccessCandidate,
  maxOutputCostPerToken: number
): boolean {
  const cost = model.outputCostPerToken;
  // A stored price below zero is not a discount, it is a broken row: no column
  // constraint keeps it out, and reading it as free would waive the ceiling.
  return cost !== null && cost >= 0 && cost <= maxOutputCostPerToken;
}
