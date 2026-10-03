import { providerOf, type IndexedModel } from '@knowtis/ai-gateway';
import {
  DEFAULT_MODEL_INTENT,
  MODEL_INTENTS,
  type AccessTier,
  type ByokProvider,
  type IntentAvailability,
  type ModelIntent,
  type ModelReasoning,
  type ModelTier,
} from '@knowtis/shared-types';

import {
  CATALOG_SCOPE,
  type CatalogScope,
} from '../execution-context/tier-policy';
import {
  BYOK_INTENT_CANDIDATES,
  effectivePrimary,
  routeIntent,
} from './byok-intent-routes';
import { toModelReasoning } from './index-reasoning';

export interface OfferedModel {
  readonly id: string;
  readonly label: string;
  readonly descriptionKey: string;
  readonly description?: string;
  readonly tier: ModelTier;
  readonly reasoning?: ModelReasoning;
}

export const CATALOG_BILLING = { PLATFORM: 'platform', KEY: 'key' } as const;
export type CatalogBilling =
  (typeof CATALOG_BILLING)[keyof typeof CATALOG_BILLING];

export interface ScopedModel {
  readonly model: OfferedModel;
  readonly servesIntent?: ModelIntent;
}

export interface TierCatalog {
  readonly tier: AccessTier;
  readonly billing: CatalogBilling;
  readonly models: readonly ScopedModel[];
  readonly intents: readonly IntentAvailability[];
}

export interface TierCatalogInput {
  readonly tier: AccessTier;
  readonly scope: CatalogScope;
  /** Oldest key first: the first one is the default primary provider. */
  readonly heldProviders: readonly ByokProvider[];
  readonly storedPrimary: ByokProvider | null;
  readonly platformIntents: Readonly<Record<ModelIntent, string>>;
  readonly offered: readonly OfferedModel[];
  readonly isSupported: (modelId: string) => boolean;
  readonly isPlatformRoutable: (modelId: string) => boolean;
  readonly indexRow: (modelId: string) => IndexedModel | undefined;
}

const NO_ROUTE = 'no_route';

/** Every model a tier may run and which intent each serves: the one scope that listing, turns and preference writes share. */
export function tierCatalog(input: TierCatalogInput): TierCatalog {
  switch (input.scope) {
    case CATALOG_SCOPE.DEFAULT_INTENT:
      return platformCatalog(input, [DEFAULT_MODEL_INTENT]);
    case CATALOG_SCOPE.PLATFORM_INTENTS:
      return platformCatalog(input, MODEL_INTENTS);
    case CATALOG_SCOPE.OWN_KEYS:
      return keyCatalog(input);
    default: {
      const _exhaustive: never = input.scope;
      throw new Error(`Unhandled catalog scope: ${String(_exhaustive)}`);
    }
  }
}

// An operator-configured intent stays servable when the offered list lacks it
// (its promotion was withdrawn, or the promoted cache is still cold).
function configuredModel(modelId: string, intent: ModelIntent): OfferedModel {
  return {
    id: modelId,
    label: modelId.slice(modelId.indexOf(':') + 1),
    descriptionKey: '',
    tier: intent,
  };
}

function platformCatalog(
  input: TierCatalogInput,
  intents: readonly ModelIntent[]
): TierCatalog {
  const byId = new Map(input.offered.map((model) => [model.id, model]));
  const models: ScopedModel[] = [];
  const availability: IntentAvailability[] = [];
  for (const intent of intents) {
    const modelId = input.platformIntents[intent];
    if (input.isSupported(modelId) && input.isPlatformRoutable(modelId)) {
      models.push({
        model: byId.get(modelId) ?? configuredModel(modelId, intent),
        servesIntent: intent,
      });
      availability.push({
        intent,
        available: true,
        modelId,
        substituted: false,
      });
    } else {
      availability.push({ intent, available: false, reason: NO_ROUTE });
    }
  }
  return {
    tier: input.tier,
    billing: CATALOG_BILLING.PLATFORM,
    models,
    intents: availability,
  };
}

function keyCatalog(input: TierCatalogInput): TierCatalog {
  const held = new Set<string>(input.heldProviders);
  const primary = effectivePrimary(input.heldProviders, input.storedPrimary);
  const intentOf = new Map<string, ModelIntent>();
  const availability: IntentAvailability[] = [];
  const routed: OfferedModel[] = [];
  for (const intent of MODEL_INTENTS) {
    const route = routeIntent(
      BYOK_INTENT_CANDIDATES[intent],
      input.heldProviders,
      primary,
      input.isSupported
    );
    if (route === null) {
      availability.push({ intent, available: false, reason: NO_ROUTE });
      continue;
    }
    intentOf.set(route.modelId, intent);
    availability.push({
      intent,
      available: true,
      modelId: route.modelId,
      substituted: route.substituted,
    });
    if (!input.offered.some((model) => model.id === route.modelId)) {
      const reasoning = toModelReasoning(
        input.indexRow(route.modelId)?.reasoning ?? null
      );
      routed.push({
        id: route.modelId,
        label: route.label,
        descriptionKey: '',
        tier: intent,
        ...(reasoning ? { reasoning } : {}),
      });
    }
  }
  const models = [...input.offered, ...routed]
    .filter(
      (model) => held.has(providerOf(model.id)) && input.isSupported(model.id)
    )
    .map((model) => {
      const servesIntent = intentOf.get(model.id);
      return servesIntent ? { model, servesIntent } : { model };
    });
  return {
    tier: input.tier,
    billing: CATALOG_BILLING.KEY,
    models,
    intents: availability,
  };
}

export function findInCatalog(
  catalog: TierCatalog,
  modelId: string
): ScopedModel | undefined {
  return catalog.models.find((scoped) => scoped.model.id === modelId);
}

export function intentModelOf(
  catalog: TierCatalog,
  intent: ModelIntent
): string | null {
  const row = catalog.intents.find((entry) => entry.intent === intent);
  return row?.available ? row.modelId : null;
}

/** A model preference as the platform serves it: a platform-billed pick stands for the intent it serves, since the platform serves intents; a key-billed pick stays a model. */
export function servedPreference<
  T extends {
    readonly preferredModel?: string | null;
    readonly preferredIntent?: ModelIntent | null;
  },
>(catalog: TierCatalog, preference: T): T {
  const intent =
    preference.preferredModel && catalog.billing === CATALOG_BILLING.PLATFORM
      ? findInCatalog(catalog, preference.preferredModel)?.servesIntent
      : undefined;
  return intent
    ? { ...preference, preferredModel: null, preferredIntent: intent }
    : preference;
}
