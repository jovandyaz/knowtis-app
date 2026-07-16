import { Inject, Injectable } from '@nestjs/common';

import type {
  DailyUsageSummary,
  MetricsPeriod,
  MetricsSummary,
  MetricsTimeseriesBucket,
} from '../../domain/ports/ai-usage.repository';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
} from '../../domain/ports/ai-usage.repository';

@Injectable()
export class AIMetricsService {
  constructor(
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usageRepository: AIUsageRepository
  ) {}

  async getGlobalDailyUsage(): Promise<DailyUsageSummary> {
    return this.usageRepository.getGlobalDailyUsage();
  }

  async getGlobalMetricsSummary(
    period: MetricsPeriod
  ): Promise<MetricsSummary> {
    return this.usageRepository.getGlobalMetricsSummary(period);
  }

  async getGlobalMetricsTimeseries(
    period: MetricsPeriod
  ): Promise<MetricsTimeseriesBucket[]> {
    return this.usageRepository.getGlobalMetricsTimeseries(period);
  }
}
