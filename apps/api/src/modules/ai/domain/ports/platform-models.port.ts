export const PLATFORM_MODELS_SOURCE = Symbol('PLATFORM_MODELS_SOURCE');

export interface PlatformModelsSource {
  /** Every model the platform serves or falls back to, once each: the intent models (fast, balanced, powerful), the fallback chain, then each intent's active resolution. Rejects with `PlatformResolutionsUnreadError` while the resolutions are only the code seed floor. */
  getPlatformModelIds(): Promise<string[]>;
}

export const PINNED_MODELS_SOURCE = Symbol('PINNED_MODELS_SOURCE');

export interface PinnedModelsSource {
  /** The models an admin chose, once each: every stored intent pin that is not auto, then every stored fallback chain id, including those the catalog no longer supports and so does not serve. */
  getPinnedModelIds(): Promise<string[]>;
}

/** The resolution store has not been read yet, so the served models are the cold-start seed floor, which must never anchor a watch. */
export class PlatformResolutionsUnreadError extends Error {
  constructor() {
    super('Platform model resolutions have not been read from the store yet');
    this.name = 'PlatformResolutionsUnreadError';
  }
}
