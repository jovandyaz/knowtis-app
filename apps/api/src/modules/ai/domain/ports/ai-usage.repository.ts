export interface DailyUsageSummary {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
  readonly requestCount: number;
}

export interface RecordUsageInput {
  readonly userId: string;
  readonly action: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly byok?: boolean;
}

export interface MetricsSummary {
  readonly totalRequests: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
  readonly byAction: Record<
    string,
    { requests: number; tokens: number; costUsd: number }
  >;
  readonly byModel: Record<
    string,
    { requests: number; tokens: number; costUsd: number }
  >;
}

export type MetricsPeriod = 'day' | 'week' | 'month';

export interface AIUsageRepository {
  getDailyUsage(userId: string): Promise<DailyUsageSummary>;
  recordUsage(input: RecordUsageInput): Promise<void>;
  getMetricsSummary(
    userId: string,
    period: MetricsPeriod
  ): Promise<MetricsSummary>;
  getGlobalDailyUsage(): Promise<DailyUsageSummary>;
  getGlobalMetricsSummary(period: MetricsPeriod): Promise<MetricsSummary>;
}

export const AI_USAGE_REPOSITORY = Symbol('AI_USAGE_REPOSITORY');
