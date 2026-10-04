import type { ModelSelectOption } from '@knowtis/design-system';
import type { AssignableModelDto } from '@knowtis/shared-types';

export const NEEDS_KEY_HINT =
  'Needs a provider key — configure it in Providers';

export const MODEL_SEARCH_PLACEHOLDER = 'Search by name or ID';

export const NO_MATCHING_MODELS_LABEL = 'No models match your search';

/** Where the picker groups a model no selector classifies. */
export const UNCLASSIFIED_GROUP = 'other';

/**
 * Assignability keys off `routableByServer`: a promoted row whose provider lost
 * its key would otherwise render assignable while the server cannot route it.
 */
export function toModelSelectOption(
  model: AssignableModelDto
): ModelSelectOption {
  const disabled = !model.routableByServer;
  const description = disabled ? NEEDS_KEY_HINT : model.description;
  return {
    id: model.id,
    label: model.label,
    tier: model.tier ?? UNCLASSIFIED_GROUP,
    disabled,
    ...(description && { description }),
  };
}
