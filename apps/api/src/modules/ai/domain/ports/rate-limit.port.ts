export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly currentTokens: number;
  readonly currentCostUsd: number;
}

export interface RateLimitProvider {
  checkAndIncrement(
    userId: string,
    estimatedTokens: number,
    limits?: { tokenLimit: number; costLimit: number }
  ): Promise<RateLimitCheckResult>;

  checkRpm(userId: string): Promise<RateLimitCheckResult>;

  correctUsage(
    userId: string,
    estimatedTokens: number,
    actualTokens: number,
    costUsd: number
  ): Promise<void>;
}

export const RATE_LIMIT_PROVIDER = Symbol('RATE_LIMIT_PROVIDER');
