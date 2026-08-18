import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  LiteLLMCatalog,
  MODEL_PRICES_SNAPSHOT,
  type ModelCatalog,
  type ModelContextWindow,
  type ModelPricing,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { unpricedCuratedModels } from './curated-pricing';
import { LITELLM_PRICES_URL } from './litellm-prices.client';

const REFRESH_TIMEOUT_MS = 10_000;

@Injectable()
export class ModelCatalogAdapter implements ModelCatalog, OnModuleInit {
  private readonly logger = new Logger(ModelCatalogAdapter.name);
  private readonly catalog = new LiteLLMCatalog(MODEL_PRICES_SNAPSHOT);
  private readonly warnedModels = new Set<string>();
  private readonly warnedPartialModels = new Set<string>();

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.get('AI_PRICING_REFRESH_ENABLED')) {
      return;
    }
    try {
      const response = await fetch(LITELLM_PRICES_URL, {
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const raw: unknown = await response.json();
      const unpriced = unpricedCuratedModels(new LiteLLMCatalog(raw));
      if (unpriced.length > 0) {
        this.logger.warn({
          event: 'ai.catalog.refresh_rejected',
          reason: 'refresh stops pricing curated models',
          unpriced,
          fallback: 'previous catalog',
        });
        return;
      }
      const accepted = this.catalog.update(raw);
      this.logger.log({
        event: 'ai.catalog.refreshed',
        accepted,
        models: this.catalog.size,
      });
    } catch (error) {
      this.logger.warn({
        event: 'ai.catalog.refresh_failed',
        reason: error instanceof Error ? error.message : 'unknown error',
        fallback: 'vendored snapshot',
      });
    }
  }

  isSupported(modelId: string): boolean {
    return this.catalog.isSupported(modelId);
  }

  getPricing(modelId: string): ModelPricing | undefined {
    const pricing = this.catalog.getPricing(modelId);
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
    return pricing;
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    return this.catalog.getContextWindow(modelId);
  }
}
