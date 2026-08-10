import { Injectable } from '@nestjs/common';

import type {
  ModelCatalog,
  ModelContextWindow,
  ModelPricing,
} from '@knowtis/ai-gateway';

import type { AiCatalogModelRow } from '../../../../database';
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
    const row = this.find(modelId);
    if (row) {
      return {
        inputCostPerToken: row.inputCostPerToken,
        outputCostPerToken: row.outputCostPerToken,
      };
    }
    return this.inner.getPricing(modelId);
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    const row = this.find(modelId);
    if (row) {
      return {
        maxInputTokens: row.maxInputTokens,
        maxOutputTokens: row.maxOutputTokens ?? undefined,
      };
    }
    return this.inner.getContextWindow(modelId);
  }

  private find(modelId: string): AiCatalogModelRow | undefined {
    return this.promoted.snapshot().find((row) => row.id === modelId);
  }
}
