import type { GatewayLogger } from '../logger';

export interface CooldownConfig {
  readonly allowedFails: number;
  readonly cooldownSeconds: number;
  readonly windowSeconds?: number | undefined;
}

export interface ProviderHealthSnapshot {
  readonly cooling: boolean;
  readonly failureCount: number;
  readonly lastFailureAt?: number | undefined;
  readonly lastSuccessAt?: number | undefined;
  readonly cooldownEndsAt?: number | undefined;
}

export interface ProviderCooldown {
  isCooling(provider: string): boolean;
  recordFailure(provider: string): void;
  recordSuccess(provider: string): void;
}

interface ProviderState {
  failures: number[];
  cooldownEndsAt?: number | undefined;
  lastFailureAt?: number | undefined;
  lastSuccessAt?: number | undefined;
}

const DEFAULT_WINDOW_SECONDS = 60;

/** Circuit breaker per provider: too many failures inside the window start a cooldown; success or expiry ends it. */
export class ProviderCooldownTracker implements ProviderCooldown {
  private readonly states = new Map<string, ProviderState>();
  private readonly config: CooldownConfig;
  private readonly logger: GatewayLogger | undefined;
  private readonly now: () => number;

  constructor(
    config: CooldownConfig,
    logger?: GatewayLogger,
    now: () => number = () => Date.now()
  ) {
    this.config = config;
    this.logger = logger;
    this.now = now;
  }

  recordFailure(provider: string): void {
    const state = this.stateFor(provider);
    const at = this.now();
    state.lastFailureAt = at;
    state.failures.push(at);
    this.pruneWindow(state, at);
    if (
      state.cooldownEndsAt === undefined &&
      state.failures.length >= this.config.allowedFails
    ) {
      state.cooldownEndsAt = at + this.config.cooldownSeconds * 1000;
      this.logger?.warn({
        event: 'ai.provider.cooldown_start',
        provider,
        failures: state.failures.length,
        cooldownSeconds: this.config.cooldownSeconds,
      });
    }
  }

  recordSuccess(provider: string): void {
    const state = this.stateFor(provider);
    state.lastSuccessAt = this.now();
    state.failures = [];
    if (state.cooldownEndsAt !== undefined) {
      state.cooldownEndsAt = undefined;
      this.logger?.warn({
        event: 'ai.provider.cooldown_end',
        provider,
        reason: 'success',
      });
    }
  }

  isCooling(provider: string): boolean {
    const state = this.states.get(provider);
    if (state?.cooldownEndsAt === undefined) {
      return false;
    }
    if (state.cooldownEndsAt <= this.now()) {
      state.cooldownEndsAt = undefined;
      state.failures = [];
      this.logger?.warn({
        event: 'ai.provider.cooldown_end',
        provider,
        reason: 'expired',
      });
      return false;
    }
    return true;
  }

  snapshot(): Record<string, ProviderHealthSnapshot> {
    const result: Record<string, ProviderHealthSnapshot> = {};
    for (const [provider, state] of this.states) {
      result[provider] = {
        cooling: this.isCooling(provider),
        failureCount: state.failures.length,
        lastFailureAt: state.lastFailureAt,
        lastSuccessAt: state.lastSuccessAt,
        cooldownEndsAt: state.cooldownEndsAt,
      };
    }
    return result;
  }

  private stateFor(provider: string): ProviderState {
    let state = this.states.get(provider);
    if (!state) {
      state = { failures: [] };
      this.states.set(provider, state);
    }
    return state;
  }

  private pruneWindow(state: ProviderState, at: number): void {
    const windowMs =
      (this.config.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
    state.failures = state.failures.filter((t) => at - t <= windowMs);
  }
}
