import type { ModelIntent } from '@knowtis/shared-types';

export interface UserAiSettings {
  preferredModel: string | null;
  preferredIntent: ModelIntent | null;
}

export interface UserAiSettingsRepository {
  getSettings(userId: string): Promise<UserAiSettings>;
  patchSettings(userId: string, patch: Partial<UserAiSettings>): Promise<void>;
}

export const USER_AI_SETTINGS_REPOSITORY = Symbol(
  'USER_AI_SETTINGS_REPOSITORY'
);
