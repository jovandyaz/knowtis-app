import { providerOf } from '@knowtis/ai-gateway';
import type { ModelAccess } from '@knowtis/shared-types';

import type { CuratedModel } from './selectable-models.catalog';

/** The freemium ladder's single policy point: open tier is free; other tiers require the caller's own provider key. Flag off → everything granted (status quo). */
export function accessFor(
  model: CuratedModel,
  byokProviders: ReadonlySet<string>,
  tierGatingOn: boolean
): ModelAccess {
  if (!tierGatingOn || model.tier === 'open') {
    return 'granted';
  }
  return byokProviders.has(providerOf(model.id)) ? 'granted' : 'requires_byok';
}
