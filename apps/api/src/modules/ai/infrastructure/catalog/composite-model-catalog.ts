import { Injectable, Logger } from '@nestjs/common';

import type {
  ModelCatalog,
  ModelContextWindow,
  ModelPricing,
} from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODEL_IDS } from '../../domain/model-catalog/selectable-models.catalog';
import { ModelIndexCache } from './model-index.cache';
import { PromotedModelsCache } from './promoted-models.cache';

@Injectable()
export class CompositeModelCatalog implements ModelCatalog {
  private readonly logger = new Logger(CompositeModelCatalog.name);
  private readonly warnedModels = new Set<string>();
  private readonly warnedPartialModels = new Set<string>();

  constructor(
    private readonly promoted: PromotedModelsCache,
    private readonly index: ModelIndexCache
  ) {}

  isSupported(modelId: string): boolean {
    return this.find(modelId) !== undefined || this.index.isSupported(modelId);
  }

  getPricing(modelId: string): ModelPricing | undefined {
    const model = this.find(modelId);
    if (model) {
      return {
        inputCostPerToken: model.inputCostPerToken,
        outputCostPerToken: model.outputCostPerToken,
      };
    }
    const pricing = this.index.getPricing(modelId);
    this.warnIfUnpriced(modelId, pricing);
    return pricing;
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    const model = this.find(modelId);
    if (model) {
      return {
        maxInputTokens: model.maxInputTokens,
        maxOutputTokens: model.maxOutputTokens ?? undefined,
      };
    }
    return this.index.getContextWindow(modelId);
  }

  /** A curated id is never overridden by a promoted model — matches the exclusion in SelectableModelsService.offered(). */
  private find(modelId: string): CatalogModel | undefined {
    if (CURATED_MODEL_IDS.has(modelId)) {
      return undefined;
    }
    return this.promoted.snapshot().find((model) => model.id === modelId);
  }

  private warnIfUnpriced(
    modelId: string,
    pricing: ModelPricing | undefined
  ): void {
    if (pricing === undefined && !this.warnedModels.has(modelId)) {
      this.warnedModels.add(modelId);
      this.logger.warn({
        event: 'ai.pricing.unknown_model',
        model: modelId,
        impact: 'usage recorded with costUsd=0',
      });
    }
    if (
      pricing !== undefined &&
      (pricing.inputCostPerToken === undefined) !==
        (pricing.outputCostPerToken === undefined) &&
      !this.warnedPartialModels.has(modelId)
    ) {
      this.warnedPartialModels.add(modelId);
      this.logger.warn({
        event: 'ai.pricing.partial_model',
        model: modelId,
        impact: 'the unpriced side of each completion is charged at $0',
      });
    }
  }
}
