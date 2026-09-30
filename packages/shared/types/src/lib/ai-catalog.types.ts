import type { AccessTier, ModelIntent, SelectableModel } from './ai.types';

/** Whether an intent can serve the caller; `substituted` means the model runs on a provider other than the caller's primary one. */
export type IntentAvailability =
  | {
      intent: ModelIntent;
      available: true;
      modelId: string;
      substituted: boolean;
    }
  | { intent: ModelIntent; available: false; reason: 'no_route' };

/** `GET /ai/models` body: only the models the caller's tier may run. */
export interface ModelCatalogResponse {
  tier: AccessTier;
  models: SelectableModel[];
  intents: IntentAvailability[];
}
