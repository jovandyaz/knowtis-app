import { providerOf } from '@knowtis/ai-gateway';
import {
  DEFAULT_MODEL_INTENT,
  type ModelFallbackReason,
  type ModelIntent,
  type ModelResolution,
  type ModelUnavailableReason,
} from '@knowtis/shared-types';

import { canonicalOf } from './byok-intent-routes';
import {
  CATALOG_BILLING,
  findInCatalog,
  intentModelOf,
  type CatalogBilling,
  type TierCatalog,
} from './tier-catalog';

export interface ModelRequest {
  /** A model the request names; never substituted. */
  readonly explicit?: string | undefined;
  /** The conversation's stored model on a HITL resume. */
  readonly pinned?: string | null | undefined;
  readonly preferredModel: string | null;
  readonly preferredIntent: ModelIntent | null;
}

export interface ModelFacts {
  readonly heldProviders: ReadonlySet<string>;
  readonly isSupported: (modelId: string) => boolean;
  /** Per model, never per provider: true only for a model the platform pays for, its configured intent models and the open-tier models it can route. */
  readonly isPlatformBilled: (modelId: string) => boolean;
}

export const MODEL_CHOICE = {
  RESOLVED: 'resolved',
  UNAVAILABLE: 'unavailable',
} as const;

export type ModelChoice =
  | {
      readonly kind: typeof MODEL_CHOICE.RESOLVED;
      readonly model: string;
      readonly resolution: ModelResolution;
    }
  | {
      readonly kind: typeof MODEL_CHOICE.UNAVAILABLE;
      readonly reason: ModelUnavailableReason;
      readonly suggestedModel: string | null;
    };

function resolved(requested: string | null, model: string): ModelChoice {
  return {
    kind: MODEL_CHOICE.RESOLVED,
    model,
    resolution: { requested, resolved: model },
  };
}

// Only a pick on the caller's own key is an override: anything else was never
// honoured, so dropping it is not a fallback the user needs to be told about.
function keyBilledPreference(
  preferredModel: string | null,
  facts: ModelFacts
): string | null {
  return preferredModel && facts.heldProviders.has(providerOf(preferredModel))
    ? preferredModel
    : null;
}

function fallbackReason(
  modelId: string,
  facts: ModelFacts
): ModelFallbackReason {
  if (!facts.isSupported(modelId)) {
    return 'model_retired';
  }
  if (
    !facts.isPlatformBilled(modelId) &&
    !facts.heldProviders.has(providerOf(modelId))
  ) {
    return 'key_removed';
  }
  return 'not_in_tier';
}

// Billing is decided per model, never by the fallback reason: a model on a key
// the caller holds, or one the platform does not pay for, was only ever
// key-billed.
function billingOf(modelId: string, facts: ModelFacts): CatalogBilling {
  return facts.heldProviders.has(providerOf(modelId)) ||
    !facts.isPlatformBilled(modelId)
    ? CATALOG_BILLING.KEY
    : CATALOG_BILLING.PLATFORM;
}

// A key-billed pick of a canonical model stands for that model: the primary
// provider only chooses which held key serves it, so running another of its
// routes is no fallback.
function sameModelRoute(
  catalog: TierCatalog,
  modelId: string,
  facts: ModelFacts
): string | undefined {
  if (
    catalog.billing !== CATALOG_BILLING.KEY ||
    billingOf(modelId, facts) !== CATALOG_BILLING.KEY
  ) {
    return undefined;
  }
  return Object.values(canonicalOf(modelId)?.routes ?? {}).find(
    (route) => findInCatalog(catalog, route) !== undefined
  );
}

/** The model a turn runs on: another model is substituted only inside the same billing class, and the substitution is reported, never silent; another held key's route of the same model is no substitution. */
export function chooseModel(
  catalog: TierCatalog,
  request: ModelRequest,
  facts: ModelFacts
): ModelChoice {
  const substitute =
    intentModelOf(catalog, request.preferredIntent ?? DEFAULT_MODEL_INTENT) ??
    intentModelOf(catalog, DEFAULT_MODEL_INTENT);
  if (request.explicit !== undefined) {
    return findInCatalog(catalog, request.explicit)
      ? resolved(request.explicit, request.explicit)
      : {
          kind: MODEL_CHOICE.UNAVAILABLE,
          reason: facts.isSupported(request.explicit)
            ? 'not_in_tier'
            : 'model_retired',
          suggestedModel: substitute,
        };
  }
  const wanted =
    request.pinned ?? keyBilledPreference(request.preferredModel, facts);
  if (!wanted) {
    return substitute
      ? resolved(null, substitute)
      : {
          kind: MODEL_CHOICE.UNAVAILABLE,
          reason: 'no_route',
          suggestedModel: null,
        };
  }
  if (findInCatalog(catalog, wanted)) {
    return resolved(wanted, wanted);
  }
  const route = sameModelRoute(catalog, wanted, facts);
  if (route) {
    return resolved(wanted, route);
  }
  const reason = fallbackReason(wanted, facts);
  if (substitute && billingOf(wanted, facts) === catalog.billing) {
    return {
      kind: MODEL_CHOICE.RESOLVED,
      model: substitute,
      resolution: {
        requested: wanted,
        resolved: substitute,
        fallback: { reason, from: wanted, to: substitute },
      },
    };
  }
  return { kind: MODEL_CHOICE.UNAVAILABLE, reason, suggestedModel: substitute };
}
