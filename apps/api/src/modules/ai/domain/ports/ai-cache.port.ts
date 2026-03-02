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
    action: string,
    model: string,
    prompt: string
  ): Promise<CachedResult | null>;
  set(
    action: string,
    model: string,
    prompt: string,
    result: CachedResult
  ): Promise<void>;
}

export const AI_CACHE = Symbol('AI_CACHE');
