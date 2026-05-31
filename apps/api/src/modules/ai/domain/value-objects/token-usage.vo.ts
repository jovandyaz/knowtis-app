import {
  ANTHROPIC_CACHE_READ_MULTIPLIER,
  ANTHROPIC_CACHE_WRITE_MULTIPLIER,
  getModelPricing,
  type ModelPricing,
} from '../constants/model-pricing';

interface TokenUsageInput {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly cacheReadTokens?: number | undefined;
  readonly cacheWriteTokens?: number | undefined;
}

export class TokenUsage {
  private constructor(
    public readonly inputTokens: number,
    public readonly outputTokens: number,
    public readonly model: string,
    public readonly costUsd: number
  ) {}

  get totalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  static create(input: TokenUsageInput, pricing?: ModelPricing): TokenUsage {
    const resolvedPricing = pricing ?? getModelPricing(input.model);
    const cacheRead = input.cacheReadTokens ?? 0;
    const cacheWrite = input.cacheWriteTokens ?? 0;
    const nonCached = Math.max(0, input.inputTokens - cacheRead - cacheWrite);
    const costUsd = resolvedPricing
      ? (nonCached * resolvedPricing.input +
          cacheRead * resolvedPricing.input * ANTHROPIC_CACHE_READ_MULTIPLIER +
          cacheWrite *
            resolvedPricing.input *
            ANTHROPIC_CACHE_WRITE_MULTIPLIER +
          input.outputTokens * resolvedPricing.output) /
        1_000_000
      : 0;
    return new TokenUsage(
      input.inputTokens,
      input.outputTokens,
      input.model,
      costUsd
    );
  }
}
