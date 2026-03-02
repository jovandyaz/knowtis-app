export interface DailyUsageSummary {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
}

export interface RecordUsageInput {
  readonly userId: string;
  readonly action: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface MetricsSummary {
  readonly totalRequests: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
  readonly avgLatencyMs: number | null;
  readonly byAction: Record<
    string,
    { requests: number; tokens: number; costUsd: number }
  >;
}

export interface AIUsageRepository {
  getDailyUsage(userId: string): Promise<DailyUsageSummary>;
  recordUsage(input: RecordUsageInput): Promise<void>;
  getMetricsSummary(
    userId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<MetricsSummary>;
}

export const AI_USAGE_REPOSITORY = Symbol('AI_USAGE_REPOSITORY');
