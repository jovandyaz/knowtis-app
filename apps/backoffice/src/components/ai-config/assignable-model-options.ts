import type { ModelSelectOption } from '@knowtis/design-system';
import type { AssignableModelDto } from '@knowtis/shared-types';

export const NEEDS_KEY_HINT =
  'Needs a provider key — configure it in Providers';

/**
 * Assignability keys off `routableByServer`, not `needsKey`: `needsKey` is
 * curated-only by formula, so a promoted row whose provider lost its key would
 * otherwise render assignable while the server cannot route it.
 */
export function toModelSelectOption(
  model: AssignableModelDto
): ModelSelectOption {
  const disabled = !model.routableByServer;
  const description = disabled ? NEEDS_KEY_HINT : model.description;
  return {
    id: model.id,
    label: model.label,
    tier: model.tier,
    disabled,
    ...(description && { description }),
  };
}
