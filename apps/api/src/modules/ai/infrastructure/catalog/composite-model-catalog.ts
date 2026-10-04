import { Injectable, Logger } from '@nestjs/common';

import type {
  ModelCatalog,
  ModelContextWindow,
  ModelPricing,
} from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { ModelIndexCache } from './model-index.cache';
import { PromotedModelsCache } from './promoted-models.cache';

/** Promoted rows and the model index as one catalog: the index wins for facts, so a promoted row supplies pricing and context only for a model the index does not carry. */
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
    return (
      this.promotedRow(modelId) !== undefined || this.index.isSupported(modelId)
    );
  }

  getPricing(modelId: string): ModelPricing | undefined {
    const model = this.unindexedPromotedRow(modelId);
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
    const model = this.unindexedPromotedRow(modelId);
    if (model) {
      return {
        maxInputTokens: model.maxInputTokens,
        maxOutputTokens: model.maxOutputTokens ?? undefined,
      };
    }
    return this.index.getContextWindow(modelId);
  }

  private unindexedPromotedRow(modelId: string): CatalogModel | undefined {
    return this.index.catalog().get(modelId)
      ? undefined
      : this.promotedRow(modelId);
  }

  private promotedRow(modelId: string): CatalogModel | undefined {
    return this.promoted.snapshot().find((model) => model.id === modelId);
  }

  private warnIfUnpriced(
    modelId: string,
    pricing: ModelPricing | undefined
  ): void {
    if (isUnpriced(pricing) && !this.warnedModels.has(modelId)) {
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

function isUnpriced(pricing: ModelPricing | undefined): boolean {
  return (
    pricing === undefined ||
    (pricing.inputCostPerToken === undefined &&
      pricing.outputCostPerToken === undefined &&
      pricing.inputCostPerSecond === undefined)
  );
}
