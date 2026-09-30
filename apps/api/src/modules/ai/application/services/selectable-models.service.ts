import { Inject, Injectable } from '@nestjs/common';

import {
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import {
  MODEL_INTENTS,
  type ModelAccess,
  type ModelIntent,
  type ModelReasoning,
  type SelectableModel,
} from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import { freeLevels } from '../../domain/model-catalog/effort-policy';
import {
  accessFor,
  type AccessCandidate,
} from '../../domain/model-catalog/model-access.policy';
import type { ModelFacts } from '../../domain/model-catalog/model-choice';
import {
  CURATED_MODEL_IDS,
  CURATED_MODELS,
} from '../../domain/model-catalog/selectable-models.catalog';
import {
  routeReasoning,
  tierCatalog,
  type OfferedModel,
  type TierCatalog,
} from '../../domain/model-catalog/tier-catalog';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const NO_BYOK: ReadonlySet<string> = new Set();

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
    platformIntents: Readonly<Record<ModelIntent, string>>
  ): TierCatalog {
    return tierCatalog({
      tier: execution.tier,
      scope: execution.policy.catalog,
      heldProviders: [...execution.byokProviders],
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

  /**
   * What the product offers: every promoted model, the curated ones the running
   * config points at, and the curated models of each provider the caller brings
   * a BYOK key for. The rest stay seeds for defaults and validation.
   */
  private catalogUnion(
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string>
  ): readonly OfferedModel[] {
    return this.offered().filter(
      (model) =>
        !CURATED_MODEL_IDS.has(model.id) ||
        configured.has(model.id) ||
        byokProviders.has(providerOf(model.id))
    );
  }

  private invocable(
    model: OfferedModel,
    byokProviders: ReadonlySet<string>
  ): boolean {
    return (
      this.catalog.isSupported(model.id) &&
      (this.registry.isModelAvailable(model.id) ||
        byokProviders.has(providerOf(model.id)))
    );
  }

  private selectable(
    model: OfferedModel,
    byokProviders: ReadonlySet<string>,
    maxOutputCostPerToken?: number
  ): boolean {
    return (
      this.invocable(model, byokProviders) &&
      this.accessFor(model, byokProviders, maxOutputCostPerToken) === 'granted'
    );
  }

  /** Prices the model through the catalog port, which is what serves a promoted row's stored cost. */
  private accessFor(
    model: OfferedModel,
    byokProviders: ReadonlySet<string>,
    maxOutputCostPerToken?: number
  ): ModelAccess {
    const candidate: AccessCandidate = {
      id: model.id,
      outputCostPerToken:
        this.catalog.getPricing(model.id)?.outputCostPerToken ?? null,
    };
    return accessFor(candidate, byokProviders, maxOutputCostPerToken);
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
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    maxOutputCostPerToken?: number,
    intentModels?: Readonly<Record<ModelIntent, string>>
  ): SelectableModel[] {
    return this.catalogUnion(configured, byokProviders)
      .filter((m) => this.invocable(m, byokProviders))
      .map((m) => {
        const billedToUser = byokProviders.has(providerOf(m.id));
        const reasoning = offeredReasoning(m.reasoning, billedToUser);
        const servesIntent = intentModels
          ? MODEL_INTENTS.find((intent) => intentModels[intent] === m.id)
          : undefined;
        return {
          id: m.id,
          label: m.label,
          descriptionKey: m.descriptionKey,
          ...(m.description ? { description: m.description } : {}),
          tier: m.tier,
          contextWindow:
            this.catalog.getContextWindow(m.id)?.maxInputTokens ?? 0,
          costClass: this.costClass(m.id),
          isDefault: m.id === systemDefault,
          billedToUser,
          routableByServer: this.registry.isModelAvailable(m.id),
          access: this.accessFor(m, byokProviders, maxOutputCostPerToken),
          ...(reasoning ? { reasoning } : {}),
          ...(servesIntent ? { servesIntent } : {}),
        };
      });
  }

  isSelectable(
    modelId: string,
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    maxOutputCostPerToken?: number
  ): boolean {
    const offered = this.catalogUnion(configured, byokProviders).find(
      (m) => m.id === modelId
    );
    return (
      !!offered &&
      this.selectable(offered, byokProviders, maxOutputCostPerToken)
    );
  }

  /** First offered model of the tier the caller's own keys can run, or null — catalog order is the rank, curated ahead of promoted. */
  firstOfTier(
    tier: ModelIntent,
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string>
  ): string | null {
    const match = this.catalogUnion(configured, byokProviders).find(
      (m) =>
        m.tier === tier &&
        byokProviders.has(providerOf(m.id)) &&
        this.invocable(m, byokProviders)
    );
    return match?.id ?? null;
  }
}
