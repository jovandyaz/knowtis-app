import { Inject, Injectable } from '@nestjs/common';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';
import type { SelectableModel } from '@knowtis/shared-types';

import {
  CURATED_MODELS,
  type CuratedModel,
} from '../../domain/model-catalog/selectable-models.catalog';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

@Injectable()
export class SelectableModelsService {
  constructor(
    @Inject(MODEL_CATALOG) private readonly catalog: ModelCatalog,
    private readonly registry: ProviderRegistryFactory
  ) {}

  private invocable(model: CuratedModel): boolean {
    return (
      this.catalog.isSupported(model.id) &&
      this.registry.isModelAvailable(model.id)
    );
  }

  private costClass(id: string): 1 | 2 | 3 {
    const pricing = this.catalog.getPricing(id);
    // outputCostPerToken is per-token; thresholds are $15/M and $5/M
    const out = pricing?.outputCostPerToken ?? 0;
    if (out >= 0.000015) {
      return 3;
    }
    if (out >= 0.000005) {
      return 2;
    }
    return 1;
  }

  list(systemDefault: string): SelectableModel[] {
    return CURATED_MODELS.filter((m) => this.invocable(m)).map((m) => ({
      id: m.id,
      label: m.label,
      descriptionKey: m.descriptionKey,
      tier: m.tier,
      contextWindow: this.catalog.getContextWindow(m.id)?.maxInputTokens ?? 0,
      costClass: this.costClass(m.id),
      isDefault: m.id === systemDefault,
    }));
  }

  isSelectable(modelId: string): boolean {
    const curated = CURATED_MODELS.find((m) => m.id === modelId);
    return curated ? this.invocable(curated) : false;
  }
}
