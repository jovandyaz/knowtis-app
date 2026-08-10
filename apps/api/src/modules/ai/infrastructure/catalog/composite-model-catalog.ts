import { Injectable } from '@nestjs/common';

import type {
  ModelCatalog,
  ModelContextWindow,
  ModelPricing,
} from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODEL_IDS } from '../../domain/model-catalog/selectable-models.catalog';
import { ModelCatalogAdapter } from './model-catalog.adapter';
import { PromotedModelsCache } from './promoted-models.cache';

@Injectable()
export class CompositeModelCatalog implements ModelCatalog {
  constructor(
    private readonly promoted: PromotedModelsCache,
    private readonly inner: ModelCatalogAdapter
  ) {}

  isSupported(modelId: string): boolean {
    return this.find(modelId) !== undefined || this.inner.isSupported(modelId);
  }

  isFast(modelId: string): boolean {
    return this.inner.isFast(modelId);
  }

  getPricing(modelId: string): ModelPricing | undefined {
    const model = this.find(modelId);
    if (model) {
      return {
        inputCostPerToken: model.inputCostPerToken,
        outputCostPerToken: model.outputCostPerToken,
      };
    }
    return this.inner.getPricing(modelId);
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    const model = this.find(modelId);
    if (model) {
      return {
        maxInputTokens: model.maxInputTokens,
        maxOutputTokens: model.maxOutputTokens ?? undefined,
      };
    }
    return this.inner.getContextWindow(modelId);
  }

  /** A curated id is never overridden by a promoted model — matches the exclusion in SelectableModelsService.catalogUnion(). */
  private find(modelId: string): CatalogModel | undefined {
    if (CURATED_MODEL_IDS.has(modelId)) {
      return undefined;
    }
    return this.promoted.snapshot().find((model) => model.id === modelId);
  }
}
