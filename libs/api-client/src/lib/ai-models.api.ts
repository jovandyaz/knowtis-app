import type {
  AIPreferences,
  SelectableModel,
  UpdateAiPreferencesInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

export const aiModelsApi = {
  getModels(): Promise<SelectableModel[]> {
    return httpClient.get<SelectableModel[]>('/ai/models');
  },
  getPreferences(): Promise<AIPreferences> {
    return httpClient.get<AIPreferences>('/ai/preferences');
  },
  updatePreferences(input: UpdateAiPreferencesInput): Promise<AIPreferences> {
    return httpClient.put<AIPreferences>('/ai/preferences', input);
  },
};
