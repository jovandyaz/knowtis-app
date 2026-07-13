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
  checkAndIncrement(
    subject: string,
    estimatedTokens: number,
    estimatedCostUsd: number,
    limits: RateLimits
  ): Promise<RateLimitCheckResult>;

  checkRpm(subject: string): Promise<RateLimitCheckResult>;

  correctUsage(
    subject: string,
    estimatedTokens: number,
    actualTokens: number,
    estimatedCostUsd: number,
    actualCostUsd: number
  ): Promise<void>;
}

export const RATE_LIMIT_PROVIDER = Symbol('RATE_LIMIT_PROVIDER');
