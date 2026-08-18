import { Inject, Injectable } from '@nestjs/common';

import {
  MODEL_CATALOG,
  providerOf,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import type {
  ModelAccess,
  ModelIntent,
  SelectableModel,
} from '@knowtis/shared-types';

import {
  accessFor,
  type AccessCandidate,
} from '../../domain/model-catalog/model-access.policy';
import {
  CURATED_MODEL_IDS,
  CURATED_MODELS,
  type CuratedModel,
} from '../../domain/model-catalog/selectable-models.catalog';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const NO_BYOK: ReadonlySet<string> = new Set();

interface OfferedModel extends CuratedModel {
  description?: string;
}

@Injectable()
export class SelectableModelsService {
  constructor(
    @Inject(MODEL_CATALOG) private readonly catalog: ModelCatalog,
    private readonly registry: ProviderRegistryFactory,
    private readonly promotedModels: PromotedModelsCache
  ) {}

  /**
   * What the product offers: every promoted model, plus the curated ones the
   * running config still points at. A curated model nobody configured is a
   * seed for defaults and validation, not something to put in front of users.
   */
  private catalogUnion(
    configured: ReadonlySet<string>
  ): readonly OfferedModel[] {
    return [
      ...CURATED_MODELS.filter((model) => configured.has(model.id)),
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
        })),
    ];
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
    tierGatingOn: boolean,
    maxOutputCostPerToken?: number
  ): boolean {
    return (
      this.invocable(model, byokProviders) &&
      this.accessFor(
        model,
        byokProviders,
        tierGatingOn,
        maxOutputCostPerToken
      ) === 'granted'
    );
  }

  /** Prices the model through the catalog port, which is what serves a promoted row's stored cost. */
  private accessFor(
    model: OfferedModel,
    byokProviders: ReadonlySet<string>,
    tierGatingOn: boolean,
    maxOutputCostPerToken?: number
  ): ModelAccess {
    const candidate: AccessCandidate = {
      id: model.id,
      tier: model.tier,
      outputCostPerToken:
        this.catalog.getPricing(model.id)?.outputCostPerToken ?? null,
    };
    return accessFor(
      candidate,
      byokProviders,
      tierGatingOn,
      maxOutputCostPerToken
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
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    tierGatingOn = false,
    maxOutputCostPerToken?: number
  ): SelectableModel[] {
    return this.catalogUnion(configured)
      .filter((m) => this.invocable(m, byokProviders))
      .map((m) => ({
        id: m.id,
        label: m.label,
        descriptionKey: m.descriptionKey,
        ...(m.description ? { description: m.description } : {}),
        tier: m.tier,
        contextWindow: this.catalog.getContextWindow(m.id)?.maxInputTokens ?? 0,
        costClass: this.costClass(m.id),
        isDefault: m.id === systemDefault,
        billedToUser: byokProviders.has(providerOf(m.id)),
        routableByServer: this.registry.isModelAvailable(m.id),
        access: this.accessFor(
          m,
          byokProviders,
          tierGatingOn,
          maxOutputCostPerToken
        ),
      }));
  }

  isSelectable(
    modelId: string,
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    tierGatingOn = false,
    maxOutputCostPerToken?: number
  ): boolean {
    const offered = this.catalogUnion(configured).find((m) => m.id === modelId);
    return (
      !!offered &&
      this.selectable(
        offered,
        byokProviders,
        tierGatingOn,
        maxOutputCostPerToken
      )
    );
  }

  /** First offered model this caller may actually run, or null when none — the landing spot when a configured default is gated. */
  firstSelectable(
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string> = NO_BYOK,
    tierGatingOn = false,
    maxOutputCostPerToken?: number
  ): string | null {
    return (
      this.catalogUnion(configured).find((m) =>
        this.selectable(m, byokProviders, tierGatingOn, maxOutputCostPerToken)
      )?.id ?? null
    );
  }

  /** First offered model of the tier the caller's own keys can run, or null — catalog order is the rank, curated ahead of promoted. */
  firstOfTier(
    tier: ModelIntent,
    configured: ReadonlySet<string>,
    byokProviders: ReadonlySet<string>
  ): string | null {
    const match = this.catalogUnion(configured).find(
      (m) =>
        m.tier === tier &&
        byokProviders.has(providerOf(m.id)) &&
        this.invocable(m, byokProviders)
    );
    return match?.id ?? null;
  }
}
