export interface CachedResult {
  readonly text: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface AICache {
  isCacheable(action: string): boolean;
  get(
    userId: string,
    action: string,
    model: string,
    prompt: string
  ): Promise<CachedResult | null>;
  set(
    userId: string,
    action: string,
    model: string,
    prompt: string,
    result: CachedResult
  ): Promise<void>;
}

export const AI_CACHE = Symbol('AI_CACHE');
