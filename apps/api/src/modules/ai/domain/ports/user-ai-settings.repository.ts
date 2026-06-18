export interface UserAiSettingsRepository {
  getPreferredModel(userId: string): Promise<string | null>;
  setPreferredModel(userId: string, model: string | null): Promise<void>;
}

export const USER_AI_SETTINGS_REPOSITORY = Symbol(
  'USER_AI_SETTINGS_REPOSITORY'
);
