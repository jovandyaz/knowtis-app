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
import { LITELLM_PRICES_URL } from './litellm-prices.client';

const REFRESH_TIMEOUT_MS = 10_000;

@Injectable()
export class ModelCatalogAdapter implements ModelCatalog, OnModuleInit {
  private readonly logger = new Logger(ModelCatalogAdapter.name);
  private readonly catalog = new LiteLLMCatalog(MODEL_PRICES_SNAPSHOT);
  private readonly warnedModels = new Set<string>();

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
      const accepted = this.catalog.update(await response.json());
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

  isFast(modelId: string): boolean {
    return this.catalog.isFast(modelId);
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
    return pricing;
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    return this.catalog.getContextWindow(modelId);
  }
}
