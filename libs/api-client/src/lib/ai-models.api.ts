import {
  AI_ACCESS_TIERS,
  type AIPreferences,
  type ModelCatalogResponse,
  type UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

const ACCESS_TIERS: readonly string[] = AI_ACCESS_TIERS;

function isModelCatalog(body: unknown): body is ModelCatalogResponse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return false;
  }
  const { tier, models, intents } = body as Record<string, unknown>;
  return (
    typeof tier === 'string' &&
    ACCESS_TIERS.includes(tier) &&
    Array.isArray(models) &&
    Array.isArray(intents)
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
