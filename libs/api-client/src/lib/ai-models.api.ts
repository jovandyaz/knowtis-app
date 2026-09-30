import type {
  AccessTier,
  AIPreferences,
  ModelCatalogResponse,
  SelectableModel,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

/** The catalog as the client reads it; `tier` is null from a server that still answers with a bare array. */
export type ModelCatalogView = Omit<ModelCatalogResponse, 'tier'> & {
  tier: AccessTier | null;
};

function toCatalogView(
  body: Partial<ModelCatalogResponse> | SelectableModel[] | null
): ModelCatalogView {
  if (Array.isArray(body)) {
    return { tier: null, models: body, intents: [] };
  }
  if (body && Array.isArray(body.models)) {
    return {
      tier: body.tier ?? null,
      models: body.models,
      intents: Array.isArray(body.intents) ? body.intents : [],
    };
  }
  throw new Error('Malformed /ai/models response');
}

export const aiModelsApi = {
  async getModels(): Promise<ModelCatalogView> {
    return toCatalogView(
      await httpClient.get<
        Partial<ModelCatalogResponse> | SelectableModel[] | null
      >('/ai/models')
    );
  },
  getPreferences(): Promise<AIPreferences> {
    return httpClient.get<AIPreferences>('/ai/preferences');
  },
  updatePreferences(input: UpdateAiPreferencesInput): Promise<AIPreferences> {
    return httpClient.put<AIPreferences>('/ai/preferences', input);
  },
};
