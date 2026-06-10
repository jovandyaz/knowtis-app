import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MODEL_CATALOG,
  ProviderCooldownTracker,
  providerOf,
  resolveChainCandidates,
  type ModelCatalog,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { WebhookAlertService } from '../alerting/webhook-alert.service';
import { ProviderRegistryFactory } from './provider-registry.factory';

export interface ProviderHealth {
  readonly configured: boolean;
  readonly cooling: boolean;
  readonly failureCount: number;
  readonly lastFailureAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly cooldownEndsAt: string | null;
}

/**
 * Resolves the ordered model candidates for a request: primary first, then
 * the configured cross-provider chain, minus providers without credentials
 * or in cooldown. Model availability is resolved per call so a future
 * per-user key source (BYOK) can plug in without touching the chain.
 */
@Injectable()
export class FallbackChainService implements OnModuleInit {
  private readonly logger = new Logger(FallbackChainService.name);
  private chain: string[] = [];

  readonly cooldown: ProviderCooldownTracker;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly providerRegistry: ProviderRegistryFactory,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    private readonly alerts: WebhookAlertService
  ) {
    this.cooldown = new ProviderCooldownTracker(
      {
        allowedFails: this.configService.get('AI_COOLDOWN_ALLOWED_FAILS'),
        cooldownSeconds: this.configService.get('AI_COOLDOWN_SECONDS'),
      },
      {
        warn: (payload) => {
          this.logger.warn(payload);
          if (payload['event'] === 'ai.provider.cooldown_start') {
            this.alerts.notify('cooldown_start', payload);
          }
        },
        error: (payload) => this.logger.error(payload),
      }
    );
  }

  onModuleInit(): void {
    const raw = this.configService.get('AI_FALLBACK_CHAIN');
    const entries = raw
      .split(',')
      .map((entry: string) => entry.trim())
      .filter((entry: string) => entry.length > 0);
    const unknown = entries.filter(
      (model: string) => !this.modelCatalog.isSupported(model)
    );
    if (unknown.length > 0) {
      throw new Error(
        `AI_FALLBACK_CHAIN contains models missing from the catalog: ${unknown.join(', ')}`
      );
    }
    this.chain = entries;
  }

  candidatesFor(primaryModel: string): string[] {
    return resolveChainCandidates({
      primaryModel,
      chain: this.chain,
      isModelAvailable: (model) =>
        this.providerRegistry.isModelAvailable(model),
      cooldown: this.cooldown,
    });
  }

  /** Passive per-provider health from the cooldown tracker — no probes, no token spend. */
  healthSnapshot(): Record<string, ProviderHealth> {
    const providers = new Set<string>([
      ...this.chain.map(providerOf),
      providerOf(this.configService.get('AI_DEFAULT_MODEL')),
      providerOf(this.configService.get('AI_FAST_MODEL')),
    ]);
    const cooldownState = this.cooldown.snapshot();
    const result: Record<string, ProviderHealth> = {};
    for (const provider of providers) {
      const state = cooldownState[provider];
      result[provider] = {
        configured: this.providerRegistry.isModelAvailable(
          `${provider}:health-check`
        ),
        cooling: state?.cooling ?? false,
        failureCount: state?.failureCount ?? 0,
        lastFailureAt: toIsoOrNull(state?.lastFailureAt),
        lastSuccessAt: toIsoOrNull(state?.lastSuccessAt),
        cooldownEndsAt: toIsoOrNull(state?.cooldownEndsAt),
      };
    }
    return result;
  }
}

function toIsoOrNull(epochMs: number | undefined): string | null {
  return epochMs === undefined ? null : new Date(epochMs).toISOString();
}
