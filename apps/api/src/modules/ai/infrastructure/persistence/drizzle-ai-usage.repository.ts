import { Inject, Injectable } from '@nestjs/common';
import { and, count, gte, sql, sum } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { aiUsage } from '../../../../database/schema';
import type {
  AIUsageRepository,
  DailyUsageSummary,
  MetricsSummary,
  RecordUsageInput,
} from '../../domain/ports/ai-usage.repository';

@Injectable()
export class DrizzleAIUsageRepository implements AIUsageRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async recordUsage(input: RecordUsageInput): Promise<void> {
    await this.db.insert(aiUsage).values({
      userId: input.userId,
      action: input.action,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd.toFixed(6),
    });
  }

  async getDailyUsage(userId: string): Promise<DailyUsageSummary> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const result = await this.db
      .select({
        totalInputTokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int`,
        totalOutputTokens: sql<number>`coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
        totalCostUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
        requestCount: count(),
      })
      .from(aiUsage)
      .where(
        and(
          sql`${aiUsage.userId} = ${userId}`,
          gte(aiUsage.createdAt, startOfDay)
        )
      );

    const row = result[0];
    return {
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
      requestCount: row?.requestCount ?? 0,
    };
  }

  async getMetricsSummary(
    userId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<MetricsSummary> {
    const since = new Date();
    if (period === 'day') {
      since.setUTCHours(0, 0, 0, 0);
    } else if (period === 'week') {
      since.setUTCDate(since.getUTCDate() - 7);
    } else {
      since.setUTCDate(since.getUTCDate() - 30);
    }

    const userAndPeriodFilter = and(
      sql`${aiUsage.userId} = ${userId}`,
      gte(aiUsage.createdAt, since)
    );

    const totals = await this.db
      .select({
        totalRequests: count(),
        totalInputTokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int`,
        totalOutputTokens: sql<number>`coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
        totalCostUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
      })
      .from(aiUsage)
      .where(userAndPeriodFilter);

    const byActionRows = await this.db
      .select({
        action: aiUsage.action,
        requests: count(),
        tokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int + coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
        costUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
      })
      .from(aiUsage)
      .where(userAndPeriodFilter)
      .groupBy(aiUsage.action);

    const row = totals[0];
    const byAction: MetricsSummary['byAction'] = {};
    for (const r of byActionRows) {
      byAction[r.action] = {
        requests: r.requests,
        tokens: Number(r.tokens),
        costUsd: Number(r.costUsd),
      };
    }

    return {
      totalRequests: row?.totalRequests ?? 0,
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
      byAction,
    };
  }
}
