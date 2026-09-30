import { Inject, Injectable } from '@nestjs/common';

import {
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import {
  DEFAULT_MODEL_INTENT,
  type ByokProvider,
  type ModelIntent,
  type ModelReasoning,
  type SelectableModel,
} from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import { freeLevels } from '../../domain/model-catalog/effort-policy';
import type { ModelFacts } from '../../domain/model-catalog/model-choice';
import {
  CURATED_MODEL_IDS,
  CURATED_MODELS,
} from '../../domain/model-catalog/selectable-models.catalog';
import {
  CATALOG_BILLING,
  routeReasoning,
  tierCatalog,
  type OfferedModel,
  type TierCatalog,
} from '../../domain/model-catalog/tier-catalog';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

/** The ladder this caller may pick from — the model's own when the turn bills their key, else the server-billed slice — or undefined when none survives. */
function offeredReasoning(
  reasoning: ModelReasoning | undefined,
  billedToUser: boolean
): ModelReasoning | undefined {
  if (!reasoning) {
    return undefined;
  }
  const levels = billedToUser ? reasoning.levels : freeLevels(reasoning.levels);
  return levels.length === 0
    ? undefined
    : { levels, mandatory: reasoning.mandatory };
}

@Injectable()
export class SelectableModelsService {
  constructor(
    @Inject(MODEL_CATALOG) private readonly catalog: ModelCatalog,
    private readonly registry: ProviderRegistryFactory,
    private readonly promotedModels: PromotedModelsCache
  ) {}

  offered(): readonly OfferedModel[] {
    return [
      ...CURATED_MODELS,
      // Code wins entirely for a duplicate id: a promoted model can never
      // rename, re-tier, re-describe, re-price or resize a curated one —
      // CompositeModelCatalog.find() applies the same exclusion.
      ...this.promotedModels
        .snapshot()
        .filter((promoted) => !CURATED_MODEL_IDS.has(promoted.id))
        .map((promoted) => ({
          id: promoted.id,
          label: promoted.label,
          descriptionKey: '',
          description: promoted.description,
          tier: promoted.tier,
          ...(promoted.reasoning ? { reasoning: promoted.reasoning } : {}),
        })),
    ];
  }

  catalogFor(
    execution: Pick<AiExecutionContext, 'tier' | 'policy' | 'byokProviders'>,
    platformIntents: Readonly<Record<ModelIntent, string>>,
    storedPrimary: ByokProvider | null
  ): TierCatalog {
    return tierCatalog({
      tier: execution.tier,
      scope: execution.policy.catalog,
      heldProviders: [...execution.byokProviders],
      storedPrimary,
      platformIntents,
      offered: this.offered(),
      isSupported: (id) => this.catalog.isSupported(id),
      isPlatformRoutable: (id) => this.registry.isModelAvailable(id),
    });
  }

  factsFor(
    byokProviders: ReadonlySet<string>,
    platformIntents: Readonly<Record<ModelIntent, string>>
  ): ModelFacts {
    const platformIntentIds = new Set(Object.values(platformIntents));
    const openTier = new Set(
      this.offered()
        .filter((model) => model.tier === 'open')
        .map((model) => model.id)
    );
    return {
      heldProviders: byokProviders,
      isSupported: (id) => this.catalog.isSupported(id),
      isPlatformBilled: (id) =>
        platformIntentIds.has(id) ||
        (openTier.has(id) && this.registry.isModelAvailable(id)),
    };
  }

  /**
   * A capability statement, so it reads every offered model, not the caller's
   * tier view: a failover candidate outside the tier still declares its ladder,
   * and a model reached only through a BYOK route reads the curated ladder of
   * the same canonical model.
   */
  reasoningOf(
    modelId: string,
    byokProviders: ReadonlySet<string>
  ): ModelReasoning | null {
    const offered = this.offered();
    const billedToUser = byokProviders.has(providerOf(modelId));
    if (
      !this.catalog.isSupported(modelId) ||
      !(this.registry.isModelAvailable(modelId) || billedToUser)
    ) {
      return null;
    }
    const listed = offered.find((m) => m.id === modelId);
    const reasoning = listed
      ? listed.reasoning
      : routeReasoning(modelId, offered);
    return offeredReasoning(reasoning, billedToUser) ?? null;
  }

  toSelectable(catalog: TierCatalog): SelectableModel[] {
    const billedToUser = catalog.billing === CATALOG_BILLING.KEY;
    return catalog.models.map(({ model, servesIntent }) => {
      const reasoning = offeredReasoning(model.reasoning, billedToUser);
      return {
        id: model.id,
        label: model.label,
        descriptionKey: model.descriptionKey,
        ...(model.description ? { description: model.description } : {}),
        tier: model.tier,
        contextWindow:
          this.catalog.getContextWindow(model.id)?.maxInputTokens ?? 0,
        costClass: this.costClass(model.id),
        isDefault: servesIntent === DEFAULT_MODEL_INTENT,
        billedToUser,
        routableByServer: this.registry.isModelAvailable(model.id),
        ...(reasoning ? { reasoning } : {}),
        ...(servesIntent ? { servesIntent } : {}),
      };
    });
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
}
