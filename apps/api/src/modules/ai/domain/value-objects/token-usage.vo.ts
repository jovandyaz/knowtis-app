import { computeTokenCostUsd, type ModelPricing } from '@knowtis/ai-gateway';

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
    const isAnthropic = input.model.startsWith('anthropic:');
    const costUsd = pricing
      ? computeTokenCostUsd(
          {
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            cacheReadTokens: isAnthropic ? (input.cacheReadTokens ?? 0) : 0,
            cacheWriteTokens: isAnthropic ? (input.cacheWriteTokens ?? 0) : 0,
          },
          pricing
        )
      : 0;
    return new TokenUsage(
      input.inputTokens,
      input.outputTokens,
      input.model,
      costUsd
    );
  }
}
