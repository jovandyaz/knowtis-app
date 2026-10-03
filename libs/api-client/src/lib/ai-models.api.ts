import {
  AI_ACCESS_TIERS,
  isModelIntent,
  type AccessTier,
  type AIPreferences,
  type IntentAvailability,
  type ModelCatalogResponse,
  type ModelIntent,
  type SelectableModel,
  type UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

const ACCESS_TIERS: readonly string[] = AI_ACCESS_TIERS;
const NO_ROUTE: Extract<IntentAvailability, { available: false }>['reason'] =
  'no_route';

type WireModel = Omit<SelectableModel, 'servesIntent'> & {
  servesIntent?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAccessTier(value: string): value is AccessTier {
  return ACCESS_TIERS.includes(value);
}

function isWireModel(value: unknown): value is WireModel {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['label'] === 'string' &&
    typeof value['billedToUser'] === 'boolean' &&
    (value['servesIntent'] === undefined ||
      typeof value['servesIntent'] === 'string')
  );
}

function withKnownIntent({
  servesIntent,
  ...model
}: WireModel): SelectableModel {
  return servesIntent !== undefined && isModelIntent(servesIntent)
    ? { ...model, servesIntent }
    : model;
}

function availabilityOf(
  intent: ModelIntent,
  entry: Record<string, unknown>
): IntentAvailability | null {
  const { available, modelId, substituted, reason } = entry;
  if (available === true) {
    return typeof modelId === 'string' && typeof substituted === 'boolean'
      ? { intent, available, modelId, substituted }
      : null;
  }
  return available === false && typeof reason === 'string'
    ? { intent, available, reason: NO_ROUTE }
    : null;
}

// A newer API may serve an intent this build has no row for, or name a reason
// it does not know: the intent is dropped, the reason read as no route, rather
// than failing the whole catalog.
function knownIntents(entries: unknown[]): IntentAvailability[] | null {
  const known: IntentAvailability[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry['intent'] !== 'string') {
      return null;
    }
    if (!isModelIntent(entry['intent'])) {
      continue;
    }
    const availability = availabilityOf(entry['intent'], entry);
    if (!availability) {
      return null;
    }
    known.push(availability);
  }
  return known;
}

function parseModelCatalog(body: unknown): ModelCatalogResponse | null {
  if (!isRecord(body)) {
    return null;
  }
  const { tier, models, intents } = body;
  if (
    typeof tier !== 'string' ||
    !isAccessTier(tier) ||
    !Array.isArray(models) ||
    !models.every(isWireModel) ||
    !Array.isArray(intents)
  ) {
    return null;
  }
  const served = knownIntents(intents);
  return (
    served && { tier, models: models.map(withKnownIntent), intents: served }
  );
}

export const aiModelsApi = {
  async getModels(): Promise<ModelCatalogResponse> {
    const catalog = parseModelCatalog(
      await httpClient.get<unknown>('/ai/models')
    );
    if (!catalog) {
      throw new Error('Malformed /ai/models response');
    }
    return catalog;
  },
  getPreferences(): Promise<AIPreferences> {
    return httpClient.get<AIPreferences>('/ai/preferences');
  },
  updatePreferences(input: UpdateAiPreferencesInput): Promise<AIPreferences> {
    return httpClient.put<AIPreferences>('/ai/preferences', input);
  },
};
