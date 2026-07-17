import { Inject, Injectable } from '@nestjs/common';

import {
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import type { SelectableModel } from '@knowtis/shared-types';

import { accessFor } from '../../domain/model-catalog/model-access.policy';
import {
  CURATED_MODELS,
  type CuratedModel,
} from '../../domain/model-catalog/selectable-models.catalog';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const NO_BYOK: ReadonlySet<string> = new Set();

@Injectable()
export class SelectableModelsService {
  constructor(
    @Inject(MODEL_CATALOG) private readonly catalog: ModelCatalog,
    private readonly registry: ProviderRegistryFactory
  ) {}

  private invocable(
    model: CuratedModel,
    byokProviders: ReadonlySet<string>
  ): boolean {
    return (
      this.catalog.isSupported(model.id) &&
      (this.registry.isModelAvailable(model.id) ||
        byokProviders.has(providerOf(model.id)))
    );
  }

  private costClass(id: string): 1 | 2 | 3 {
    const pricing = this.catalog.getPricing(id);
    // outputCostPerToken is per-token; thresholds are $20/M and $10/M so the
    // Claude tiers rank Haiku ($) < Sonnet ($$) < Opus ($$$).
    const out = pricing?.outputCostPerToken ?? 0;
    if (out >= 0.00002) {
      return 3;
    }
    if (out >= 0.00001) {
      return 2;
    }
    return 1;
  }

  list(
    systemDefault: string,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    tierGatingOn = false
  ): SelectableModel[] {
    return CURATED_MODELS.filter((m) => this.invocable(m, byokProviders)).map(
      (m) => ({
        id: m.id,
        label: m.label,
        descriptionKey: m.descriptionKey,
        tier: m.tier,
        contextWindow: this.catalog.getContextWindow(m.id)?.maxInputTokens ?? 0,
        costClass: this.costClass(m.id),
        isDefault: m.id === systemDefault,
        billedToUser: byokProviders.has(providerOf(m.id)),
        routableByServer: this.registry.isModelAvailable(m.id),
        access: accessFor(m, byokProviders, tierGatingOn),
      })
    );
  }

  isSelectable(
    modelId: string,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    tierGatingOn = false
  ): boolean {
    const curated = CURATED_MODELS.find((m) => m.id === modelId);
    return (
      !!curated &&
      this.invocable(curated, byokProviders) &&
      accessFor(curated, byokProviders, tierGatingOn) === 'granted'
    );
  }
}
