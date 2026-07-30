import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ProviderCooldownTracker,
  providerOf,
  resolveChainCandidates,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { AI_SETTING_DEFAULTS, parseChain } from '../../domain/ai-settings';
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

  /**
   * Seeds the chain so cross-provider fallback works before the first async
   * refresh from the source (guard-tested against the catalog). The optional
   * arg is a test seam; production seeds the code default.
   */
  onModuleInit(
    seedChain: string[] = parseChain(AI_SETTING_DEFAULTS.ai_fallback_chain)
  ): void {
    this.chain = seedChain;
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
      providerOf(AI_SETTING_DEFAULTS.ai_default_model),
      providerOf(AI_SETTING_DEFAULTS.ai_fast_model),
    ]);
    const cooldownState = this.cooldown.snapshot();
    // Cooldown keys are per-model for aggregator providers (OpenRouter); fold
    // them back to the provider so this stays a provider-level view.
    const byProvider = new Map<string, (typeof cooldownState)[string][]>();
    for (const [key, state] of Object.entries(cooldownState)) {
      const group = byProvider.get(providerOf(key)) ?? [];
      group.push(state);
      byProvider.set(providerOf(key), group);
    }
    const result: Record<string, ProviderHealth> = {};
    for (const provider of providers) {
      const states = byProvider.get(provider) ?? [];
      result[provider] = {
        configured: this.providerRegistry.isModelAvailable(
          `${provider}:health-check`
        ),
        cooling: states.some((s) => s.cooling),
        failureCount: states.reduce((total, s) => total + s.failureCount, 0),
        lastFailureAt: toIsoOrNull(
          maxDefined(states.map((s) => s.lastFailureAt))
        ),
        lastSuccessAt: toIsoOrNull(
          maxDefined(states.map((s) => s.lastSuccessAt))
        ),
        cooldownEndsAt: toIsoOrNull(
          maxDefined(states.map((s) => s.cooldownEndsAt))
        ),
      };
    }
    return result;
  }
}

function toIsoOrNull(epochMs: number | undefined): string | null {
  return epochMs === undefined ? null : new Date(epochMs).toISOString();
}

function maxDefined(values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined);
  return defined.length > 0 ? Math.max(...defined) : undefined;
}
