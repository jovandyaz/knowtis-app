import { Injectable } from '@nestjs/common';

import { providerOf } from '@knowtis/ai-gateway';
import type { AssignableModelDto } from '@knowtis/shared-types';

import {
  CURATED_MODEL_IDS,
  CURATED_MODELS,
} from '../../domain/model-catalog/selectable-models.catalog';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

@Injectable()
export class AssignableModelsService {
  constructor(
    private readonly registry: ProviderRegistryFactory,
    private readonly promotedModels: PromotedModelsCache
  ) {}

  /**
   * Every model an admin may assign as an intent default: all curated models —
   * unconfigured providers surface as `needsKey` instead of disappearing — plus
   * every promoted model. Curated wins a duplicate id, mirroring catalogUnion.
   */
  async list(): Promise<AssignableModelDto[]> {
    const curated = CURATED_MODELS.map((model): AssignableModelDto => {
      const routableByServer = this.registry.isModelAvailable(model.id);
      return {
        id: model.id,
        label: model.label,
        // Curated descriptions are frontend i18n keys; the backoffice renders label + id.
        description: '',
        tier: model.tier,
        provider: providerOf(model.id),
        routableByServer,
        needsKey: !routableByServer,
        promoted: false,
      };
    });
    const promoted = this.promotedModels
      .snapshot()
      .filter((model) => !CURATED_MODEL_IDS.has(model.id))
      .map(
        (model): AssignableModelDto => ({
          id: model.id,
          label: model.label,
          description: model.description,
          tier: model.tier,
          provider: providerOf(model.id),
          // Promotion implies the server-keyed openrouter route, but the
          // registry stays the one source of truth for routability.
          routableByServer: this.registry.isModelAvailable(model.id),
          needsKey: false,
          promoted: true,
        })
      );
    return [...curated, ...promoted];
  }
}
