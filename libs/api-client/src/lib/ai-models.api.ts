import {
  AI_ACCESS_TIERS,
  isModelIntent,
  type AIPreferences,
  type IntentAvailability,
  type ModelCatalogResponse,
  type SelectableModel,
  type UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

const ACCESS_TIERS: readonly string[] = AI_ACCESS_TIERS;
const NO_ROUTE: Extract<IntentAvailability, { available: false }>['reason'] =
  'no_route';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownIntent(value: unknown): boolean {
  return typeof value === 'string' && isModelIntent(value);
}

function isSelectableModel(value: unknown): value is SelectableModel {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['label'] === 'string' &&
    typeof value['billedToUser'] === 'boolean' &&
    (value['servesIntent'] === undefined ||
      isKnownIntent(value['servesIntent']))
  );
}

function isIntentAvailability(value: unknown): value is IntentAvailability {
  if (!isRecord(value) || !isKnownIntent(value['intent'])) {
    return false;
  }
  if (value['available'] === true) {
    return (
      typeof value['modelId'] === 'string' &&
      typeof value['substituted'] === 'boolean'
    );
  }
  return value['available'] === false && value['reason'] === NO_ROUTE;
}

function isModelCatalog(body: unknown): body is ModelCatalogResponse {
  if (!isRecord(body)) {
    return false;
  }
  const { tier, models, intents } = body;
  return (
    typeof tier === 'string' &&
    ACCESS_TIERS.includes(tier) &&
    Array.isArray(models) &&
    models.every(isSelectableModel) &&
    Array.isArray(intents) &&
    intents.every(isIntentAvailability)
  );
}

export const aiModelsApi = {
  async getModels(): Promise<ModelCatalogResponse> {
    const body = await httpClient.get<unknown>('/ai/models');
    if (!isModelCatalog(body)) {
      throw new Error('Malformed /ai/models response');
    }
    return body;
  },
  getPreferences(): Promise<AIPreferences> {
    return httpClient.get<AIPreferences>('/ai/preferences');
  },
  updatePreferences(input: UpdateAiPreferencesInput): Promise<AIPreferences> {
    return httpClient.put<AIPreferences>('/ai/preferences', input);
  },
};
