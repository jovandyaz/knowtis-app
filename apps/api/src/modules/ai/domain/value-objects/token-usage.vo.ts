import { getModelPricing, type ModelPricing } from '../constants/model-pricing';

interface TokenUsageInput {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
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
    const costUsd = resolvedPricing
      ? (input.inputTokens * resolvedPricing.input) / 1_000_000 +
        (input.outputTokens * resolvedPricing.output) / 1_000_000
      : 0;
    return new TokenUsage(
      input.inputTokens,
      input.outputTokens,
      input.model,
      costUsd
    );
  }
}
