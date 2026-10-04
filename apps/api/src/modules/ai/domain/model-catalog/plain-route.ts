import { deriveCanonical, providerOf } from '@knowtis/ai-gateway';

import { OPENROUTER_ID_PREFIX } from './selectable-models.catalog';

const VARIANT_SEPARATOR = ':';

function authorSlugOf(modelId: string): string {
  if (modelId.startsWith(OPENROUTER_ID_PREFIX)) {
    return modelId.slice(OPENROUTER_ID_PREFIX.length);
  }
  const provider = providerOf(modelId);
  return `${provider}/${modelId.slice(provider.length + VARIANT_SEPARATOR.length)}`;
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
