import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

export interface UserAiSettings {
  preferredModel: string | null;
  preferredIntent: ModelIntent | null;
  primaryProvider: ByokProvider | null;
  ghostTextEnabled: boolean;
}

export interface UserAiSettingsRepository {
  getSettings(userId: string): Promise<UserAiSettings>;
  patchSettings(userId: string, patch: Partial<UserAiSettings>): Promise<void>;
  /** Clears the preferred model only while it is still `model`, so a pick written after the caller read it is never erased. */
  clearPreferredModel(userId: string, model: string): Promise<void>;
  /**
   * Clears the primary provider and a preferred model on `provider`, in one
   * write that does nothing while the caller holds a key for it: a clear that
   * lands after the key was added back never erases a choice made on that key.
   */
  clearBoundToUnheldProvider(
    userId: string,
    provider: ByokProvider
  ): Promise<void>;
}

export const USER_AI_SETTINGS_REPOSITORY = Symbol(
  'USER_AI_SETTINGS_REPOSITORY'
);
