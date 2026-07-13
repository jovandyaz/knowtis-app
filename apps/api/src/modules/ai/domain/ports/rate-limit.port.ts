export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly currentTokens: number;
  readonly currentCostUsd: number;
}

export interface RateLimits {
  readonly tokenLimit: number;
  readonly costLimit: number;
}

export interface RateLimitProvider {
  /**
   * `countGlobal: false` keeps the reservation out of the global daily-spend
   * counter — for secondary reservations (per-IP) whose spend the primary
   * user-subject call already counted.
   */
  checkAndIncrement(
    subject: string,
    estimatedTokens: number,
    estimatedCostUsd: number,
    limits: RateLimits,
    countGlobal?: boolean
  ): Promise<RateLimitCheckResult>;

  checkRpm(subject: string): Promise<RateLimitCheckResult>;

  correctUsage(
    subject: string,
    estimatedTokens: number,
    actualTokens: number,
    estimatedCostUsd: number,
    actualCostUsd: number,
    countGlobal?: boolean
  ): Promise<void>;

  recordByokCost(subject: string, costUsd: number): Promise<void>;

  getByokCostUsd(subject: string): Promise<number>;

  recordGlobalCost(costUsd: number): Promise<void>;

  getGlobalSpendUsd(): Promise<number>;

  /**
   * Atomically claims the named once-per-UTC-day flag across all instances.
   * Resolves true only for the first claimant of the day.
   */
  claimDailyFlag(name: string): Promise<boolean>;
}

export const RATE_LIMIT_PROVIDER = Symbol('RATE_LIMIT_PROVIDER');
