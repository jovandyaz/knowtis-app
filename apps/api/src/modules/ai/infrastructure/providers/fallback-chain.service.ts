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

export const FALLBACK_CHAIN_SOURCE = Symbol('FALLBACK_CHAIN_SOURCE');

/** Supplies the effective cross-provider fallback chain (DB row over env default). */
export interface FallbackChainSource {
  getFallbackChain(): Promise<string[]>;
}

const CHAIN_TTL_MS = 30_000; // matches the AI config cache window

export interface ProviderHealth {
  readonly configured: boolean;
  readonly cooling: boolean;
  readonly failureCount: number;
  readonly lastFailureAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly cooldownEndsAt: string | null;
}

/**
 * Resolves the ordered model candidates for a request: primary first, then the
 * cross-provider chain, minus providers without credentials or in cooldown. The
 * chain refreshes from FallbackChainSource in the background so a runtime
 * override applies within one TTL without a redeploy.
 */
@Injectable()
export class FallbackChainService implements OnModuleInit {
  private readonly logger = new Logger(FallbackChainService.name);
  private chain: string[] = [];
  private chainRefreshedAt = 0;
  private chainGeneration = 0;

  readonly cooldown: ProviderCooldownTracker;

  constructor(
    @Inject(FALLBACK_CHAIN_SOURCE)
    private readonly chainSource: FallbackChainSource,
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

  /** Seeds the chain from env (routing works before the first DB refresh); fails fast on a bad env chain. */
  onModuleInit(): void {
    const entries = parseChain(this.configService.get('AI_FALLBACK_CHAIN'));
    const unknown = entries.filter(
      (model) => !this.modelCatalog.isSupported(model)
    );
    if (unknown.length > 0) {
      throw new Error(
        `AI_FALLBACK_CHAIN contains models missing from the catalog: ${unknown.join(', ')}`
      );
    }
    if (entries.length === 0) {
      this.logger.warn(
        'AI_FALLBACK_CHAIN is empty — cross-provider fallback is disabled until a chain is configured'
      );
    }
    this.chain = entries;
  }

  candidatesFor(primaryModel: string): string[] {
    this.refreshChainIfStale();
    return resolveChainCandidates({
      primaryModel,
      chain: this.chain,
      isModelAvailable: (model) =>
        this.providerRegistry.isModelAvailable(model),
      cooldown: this.cooldown,
    });
  }

  private refreshChainIfStale(): void {
    const now = Date.now();
    if (now - this.chainRefreshedAt < CHAIN_TTL_MS) {
      return;
    }
    // Claim the window before the read so a hung read can't pin the snapshot:
    // after the TTL a new refresh starts even if this one never settles.
    this.chainRefreshedAt = now;
    const generation = ++this.chainGeneration;
    void this.chainSource
      .getFallbackChain()
      .then((chain) => {
        // A slow earlier read must not clobber a newer one.
        if (generation === this.chainGeneration && chain.length > 0) {
          this.chain = chain;
        }
      })
      .catch((error) =>
        this.logger.warn('Failed to refresh fallback chain from config', error)
      );
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

function parseChain(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toIsoOrNull(epochMs: number | undefined): string | null {
  return epochMs === undefined ? null : new Date(epochMs).toISOString();
}
