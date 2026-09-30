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
  body: ModelCatalogResponse | SelectableModel[]
): ModelCatalogView {
  return Array.isArray(body) ? { tier: null, models: body, intents: [] } : body;
}

export const aiModelsApi = {
  async getModels(): Promise<ModelCatalogView> {
    return toCatalogView(
      await httpClient.get<ModelCatalogResponse | SelectableModel[]>(
        '/ai/models'
      )
    );
  },
  getPreferences(): Promise<AIPreferences> {
    return httpClient.get<AIPreferences>('/ai/preferences');
  },
  updatePreferences(input: UpdateAiPreferencesInput): Promise<AIPreferences> {
    return httpClient.put<AIPreferences>('/ai/preferences', input);
  },
};
