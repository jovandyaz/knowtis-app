import { Inject, Injectable } from '@nestjs/common';

import {
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
  type ModelIndexCatalog,
} from '@knowtis/ai-gateway';
import {
  DEFAULT_MODEL_INTENT,
  type ByokProvider,
  type ModelIntent,
  type ModelReasoning,
  type SelectableModel,
} from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import {
  resolveByokSelectors,
  type ByokResolutions,
} from '../../domain/model-catalog/byok-intent-routes';
import { freeLevels } from '../../domain/model-catalog/effort-policy';
import { toModelReasoning } from '../../domain/model-catalog/index-reasoning';
import type { ModelFacts } from '../../domain/model-catalog/model-choice';
import { plainRouteCanonical } from '../../domain/model-catalog/plain-route';
import {
  CURATED_MODEL_IDS,
  CURATED_MODELS,
} from '../../domain/model-catalog/selectable-models.catalog';
import {
  CATALOG_BILLING,
  tierCatalog,
  type OfferedModel,
  type TierCatalog,
} from '../../domain/model-catalog/tier-catalog';
import { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
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
  private readonly byokMemo = new WeakMap<ModelIndexCatalog, ByokResolutions>();

  constructor(
    @Inject(MODEL_CATALOG) private readonly catalog: ModelCatalog,
    private readonly registry: ProviderRegistryFactory,
    private readonly promotedModels: PromotedModelsCache,
    private readonly index: ModelIndexCache
  ) {}

  /** The curated and promoted models with their copy and tier; each ladder comes from the model's index row, never from the entry. */
  offered(): readonly OfferedModel[] {
    const listed: OfferedModel[] = [
      ...CURATED_MODELS.map(({ id, label, descriptionKey, tier }) => ({
        id,
        label,
        descriptionKey,
        tier,
      })),
      // Code wins for a duplicate id: a promoted model can never rename,
      // re-tier or re-describe a curated one.
      ...this.promotedModels
        .snapshot()
        .filter((promoted) => !CURATED_MODEL_IDS.has(promoted.id))
        .map((promoted) => ({
          id: promoted.id,
          label: promoted.label,
          descriptionKey: '',
          description: promoted.description,
          tier: promoted.tier,
        })),
    ];
    return listed.map((model) => {
      const reasoning = this.indexReasoning(model.id);
      return reasoning ? { ...model, reasoning } : model;
    });
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
      indexRow: (id) => this.index.catalog().get(id),
      byok: this.byokResolutions(),
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
      canonicalOf: (id) =>
        plainRouteCanonical(id, this.index.catalog().get(id)?.canonical),
      isPlatformBilled: (id) =>
        platformIntentIds.has(id) ||
        (openTier.has(id) && this.registry.isModelAvailable(id)),
    };
  }

  /**
   * A capability statement, so it reads the model's own index row, not the
   * caller's tier view: a failover candidate outside the tier still declares
   * its ladder, and each route of a model declares the ladder it accepts.
   */
  reasoningOf(
    modelId: string,
    byokProviders: ReadonlySet<string>
  ): ModelReasoning | null {
    const billedToUser = byokProviders.has(providerOf(modelId));
    if (
      !this.catalog.isSupported(modelId) ||
      !(this.registry.isModelAvailable(modelId) || billedToUser)
    ) {
      return null;
    }
    return offeredReasoning(this.indexReasoning(modelId), billedToUser) ?? null;
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

  // Each index refresh serves a new catalog instance, so keying on it re-resolves
  // the selectors once per refresh and never per request.
  private byokResolutions(): ByokResolutions {
    const catalog = this.index.catalog();
    const memoized = this.byokMemo.get(catalog);
    if (memoized) {
      return memoized;
    }
    const resolutions = resolveByokSelectors(catalog.all(), new Date());
    this.byokMemo.set(catalog, resolutions);
    return resolutions;
  }

  private indexReasoning(modelId: string): ModelReasoning | undefined {
    return toModelReasoning(
      this.index.catalog().get(modelId)?.reasoning ?? null
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
}
