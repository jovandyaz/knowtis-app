import type { ModelCatalog } from '@knowtis/ai-gateway';

import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';

function isPriced(catalog: ModelCatalog, modelId: string): boolean {
  const pricing = catalog.getPricing(modelId);
  return (
    catalog.isSupported(modelId) &&
    (pricing?.inputCostPerToken ?? 0) > 0 &&
    (pricing?.outputCostPerToken ?? 0) > 0 &&
    (catalog.getContextWindow(modelId)?.maxInputTokens ?? 0) > 0
  );
}

/**
 * Ids of the curated models this catalog cannot fully price. Empty means every
 * model the platform serves for free carries a rate the budget breaker can see;
 * anything else means spend would be recorded as `costUsd=0`.
 */
export function unpricedCuratedModels(catalog: ModelCatalog): string[] {
  return CURATED_MODELS.filter((model) => !isPriced(catalog, model.id)).map(
    (model) => model.id
  );
}
