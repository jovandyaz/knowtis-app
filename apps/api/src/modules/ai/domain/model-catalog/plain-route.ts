import { deriveCanonical, providerOf } from '@knowtis/ai-gateway';

import { OPENROUTER_ID_PREFIX, slugOf } from './catalog-model';

const VARIANT_SEPARATOR = ':';

function authorSlugOf(modelId: string): string {
  return modelId.startsWith(OPENROUTER_ID_PREFIX)
    ? slugOf(modelId)
    : `${providerOf(modelId)}/${slugOf(modelId)}`;
}

/**
 * The index canonical a model id stands for, only when the id is a plain route
 * of it: its own identity is that canonical and it carries no `:variant`. A
 * pricier SKU or a batch variant filed under the same canonical is a different
 * model to bill, so it yields undefined.
 */
export function plainRouteCanonical(
  modelId: string,
  indexCanonical: string | undefined
): string | undefined {
  if (indexCanonical === undefined) {
    return undefined;
  }
  const authorSlug = authorSlugOf(modelId);
  return !authorSlug.includes(VARIANT_SEPARATOR) &&
    deriveCanonical(authorSlug) === indexCanonical
    ? indexCanonical
    : undefined;
}
