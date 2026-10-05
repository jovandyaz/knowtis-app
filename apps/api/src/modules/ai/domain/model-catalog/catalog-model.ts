import type { CatalogModelStatus, ModelTier } from '@knowtis/shared-types';

/** Namespace every OpenRouter model id carries: this prefix followed by the upstream slug. */
export const OPENROUTER_ID_PREFIX = 'openrouter:';

const PROVIDER_SEPARATOR = ':';
const AUTHOR_SEPARATOR = '/';

/** The model id without its provider: `vendor/model` on OpenRouter, the vendor's own id on a direct provider. */
export function slugOf(modelId: string): string {
  return modelId.slice(modelId.indexOf(PROVIDER_SEPARATOR) + 1);
}

/** Who makes the model: the vendor of an OpenRouter `vendor/model` slug, else the direct provider the id names; null for an OpenRouter slug without a vendor. */
export function authorOf(modelId: string): string | null {
  if (!modelId.startsWith(OPENROUTER_ID_PREFIX)) {
    return modelId.slice(0, modelId.indexOf(PROVIDER_SEPARATOR));
  }
  const slug = slugOf(modelId);
  const vendorEnd = slug.indexOf(AUTHOR_SEPARATOR);
  return vendorEnd === -1 ? null : slug.slice(0, vendorEnd);
}

/** A model tracked in the AI catalog: discovered upstream as a candidate, promoted by an admin, and back to candidate when retired. */
export interface CatalogModel {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly status: CatalogModelStatus;
  readonly tier: ModelTier;
  readonly inputCostPerToken: number;
  readonly outputCostPerToken: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number | null;
  readonly intelligenceIndex: number | null;
  readonly upstreamCreatedAt: Date | null;
  readonly upstreamExpirationDate: Date | null;
  readonly lastSeenAt: Date;
  readonly promotedBy: string | null;
  readonly promotedAt: Date | null;
}
