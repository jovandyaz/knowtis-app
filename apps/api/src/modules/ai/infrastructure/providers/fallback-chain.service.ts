import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ProviderCooldownTracker,
  providerOf,
  resolveChainCandidates,
  type ChainScope,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { WebhookAlertService } from '../alerting/webhook-alert.service';
import { ProviderRegistryFactory } from './provider-registry.factory';

export const FALLBACK_CHAIN_SOURCE = Symbol('FALLBACK_CHAIN_SOURCE');

/** Supplies the effective cross-provider fallback chain: the pinned chain, else the one derived from the served intents. */
export interface FallbackChainSource {
  getFallbackChain(): Promise<string[]>;
}

const CHAIN_TTL_MS = 30_000;

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
export class FallbackChainService
  implements OnModuleInit, OnApplicationBootstrap
{
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

  /** Starts from `seedChain`, a test seam; production starts empty and loads the chain in `onApplicationBootstrap`, after every module's init, so the platform resolutions are warm. */
  onModuleInit(seedChain: string[] = []): void {
    this.chain = seedChain;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.refreshChain();
  }

  candidatesFor(primaryModel: string, scope?: ChainScope): string[] {
    this.refreshChainIfStale();
    return resolveChainCandidates({
      primaryModel,
      chain: this.chain,
      scope,
      isModelAvailable: (model) =>
        this.providerRegistry.isModelAvailable(model),
      cooldown: this.cooldown,
    });
  }

  private refreshChainIfStale(): void {
    if (Date.now() - this.chainRefreshedAt < CHAIN_TTL_MS) {
      return;
    }
    void this.refreshChain();
  }

  private async refreshChain(): Promise<void> {
    // Claim the window before the read so a hung read can't pin the snapshot:
    // after the TTL a new refresh starts even if this one never settles.
    this.chainRefreshedAt = Date.now();
    const generation = ++this.chainGeneration;
    try {
      const chain = await this.chainSource.getFallbackChain();
      // A slow earlier read must not clobber a newer one.
      if (generation === this.chainGeneration && chain.length > 0) {
        this.chain = chain;
      }
    } catch (error) {
      this.logger.warn('Failed to refresh fallback chain from config', error);
    }
  }

  /** Passive per-provider health from the cooldown tracker — no probes, no token spend. */
  healthSnapshot(): Record<string, ProviderHealth> {
    const cooldownState = this.cooldown.snapshot();
    // Cooldown keys are per-model for aggregator providers (OpenRouter); fold
    // them back to the provider so this stays a provider-level view.
    const byProvider = new Map<string, (typeof cooldownState)[string][]>();
    for (const [key, state] of Object.entries(cooldownState)) {
      const group = byProvider.get(providerOf(key)) ?? [];
      group.push(state);
      byProvider.set(providerOf(key), group);
    }
    const providers = new Set<string>([
      ...this.providerRegistry.knownProviders(),
      ...byProvider.keys(),
      ...this.chain.map(providerOf),
    ]);
    const result: Record<string, ProviderHealth> = {};
    for (const provider of providers) {
      const states = byProvider.get(provider) ?? [];
      result[provider] = {
        configured: this.providerRegistry.isProviderConfigured(provider),
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
