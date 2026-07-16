import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, sql, sum, type SQL } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { aiUsage } from '../../../../database/schema';
import type {
  AIUsageRepository,
  DailyUsageSummary,
  MetricsPeriod,
  MetricsSummary,
  MetricsTimeseriesBucket,
  RecordUsageInput,
} from '../../domain/ports/ai-usage.repository';

export function bucketToUtcIso(bucket: string | Date): string {
  if (bucket instanceof Date) {
    // postgres.js parses a `timestamp without time zone` value using the
    // local wall clock, so reassemble the Date's local components as UTC to
    // recover the truncated bucket instant regardless of the server's TZ.
    return new Date(
      Date.UTC(
        bucket.getFullYear(),
        bucket.getMonth(),
        bucket.getDate(),
        bucket.getHours(),
        bucket.getMinutes(),
        bucket.getSeconds()
      )
    ).toISOString();
  }
  return new Date(`${bucket.replace(' ', 'T')}Z`).toISOString();
}

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
      byok: input.byok ?? false,
    });
  }

  async getDailyUsage(userId: string): Promise<DailyUsageSummary> {
    return this.queryDailyUsage(
      and(sql`${aiUsage.userId} = ${userId}`, eq(aiUsage.byok, false))
    );
  }

  async getGlobalDailyUsage(): Promise<DailyUsageSummary> {
    return this.queryDailyUsage();
  }

  async getMetricsSummary(
    userId: string,
    period: MetricsPeriod
  ): Promise<MetricsSummary> {
    return this.queryMetricsSummary(period, sql`${aiUsage.userId} = ${userId}`);
  }

  async getGlobalMetricsSummary(
    period: MetricsPeriod
  ): Promise<MetricsSummary> {
    return this.queryMetricsSummary(period);
  }

  async getGlobalMetricsTimeseries(
    period: MetricsPeriod
  ): Promise<MetricsTimeseriesBucket[]> {
    const since = this.periodToDate(period);
    const granularity: 'hour' | 'day' = period === 'day' ? 'hour' : 'day';
    const bucketExpr =
      granularity === 'hour'
        ? sql<string>`date_trunc('hour', ${aiUsage.createdAt} at time zone 'utc')`
        : sql<string>`date_trunc('day', ${aiUsage.createdAt} at time zone 'utc')`;

    const rows = await this.db
      .select({
        bucket: bucketExpr,
        requests: count(),
        inputTokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int`,
        outputTokens: sql<number>`coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
        costUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(bucketExpr);

    const byIso = new Map(
      rows.map((r) => [bucketToUtcIso(r.bucket), r] as const)
    );

    return this.buildBucketStarts(since, granularity).map((start) => {
      const iso = start.toISOString();
      const row = byIso.get(iso);
      return {
        bucketStart: iso,
        requests: row?.requests ?? 0,
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        costUsd: Number(row?.costUsd ?? 0),
      };
    });
  }

  private buildBucketStarts(since: Date, granularity: 'hour' | 'day'): Date[] {
    const stepMs = granularity === 'hour' ? 3_600_000 : 86_400_000;
    const start = new Date(since);
    if (granularity === 'hour') {
      start.setUTCMinutes(0, 0, 0);
    } else {
      start.setUTCHours(0, 0, 0, 0);
    }
    const buckets: Date[] = [];
    for (let t = start.getTime(); t <= Date.now(); t += stepMs) {
      buckets.push(new Date(t));
    }
    return buckets;
  }

  private async queryDailyUsage(userFilter?: SQL): Promise<DailyUsageSummary> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const conditions = userFilter
      ? and(userFilter, gte(aiUsage.createdAt, startOfDay))
      : gte(aiUsage.createdAt, startOfDay);

    const result = await this.db
      .select({
        totalInputTokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int`,
        totalOutputTokens: sql<number>`coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
        totalCostUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
        requestCount: count(),
      })
      .from(aiUsage)
      .where(conditions);

    const row = result[0];
    return {
      totalInputTokens: Number(row?.totalInputTokens ?? 0),
      totalOutputTokens: Number(row?.totalOutputTokens ?? 0),
      totalCostUsd: Number(row?.totalCostUsd ?? 0),
      requestCount: row?.requestCount ?? 0,
    };
  }

  private async queryMetricsSummary(
    period: MetricsPeriod,
    userFilter?: SQL
  ): Promise<MetricsSummary> {
    const since = this.periodToDate(period);

    const periodFilter = gte(aiUsage.createdAt, since);
    const conditions = userFilter
      ? and(userFilter, periodFilter)
      : periodFilter;

    const [totals, byActionRows, byModelRows] = await Promise.all([
      this.db
        .select({
          totalRequests: count(),
          totalInputTokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int`,
          totalOutputTokens: sql<number>`coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
          totalCostUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
        })
        .from(aiUsage)
        .where(conditions),
      this.db
        .select({
          action: aiUsage.action,
          requests: count(),
          tokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int + coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
          costUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
        })
        .from(aiUsage)
        .where(conditions)
        .groupBy(aiUsage.action),
      this.db
        .select({
          model: aiUsage.model,
          requests: count(),
          tokens: sql<number>`coalesce(${sum(aiUsage.inputTokens)}, 0)::int + coalesce(${sum(aiUsage.outputTokens)}, 0)::int`,
          costUsd: sql<string>`coalesce(${sum(aiUsage.costUsd)}, 0)`,
        })
        .from(aiUsage)
        .where(conditions)
        .groupBy(aiUsage.model),
    ]);

    const row = totals[0];
    const byAction: MetricsSummary['byAction'] = {};
    for (const r of byActionRows) {
      byAction[r.action] = {
        requests: r.requests,
        tokens: Number(r.tokens),
        costUsd: Number(r.costUsd),
      };
    }

    const byModel: MetricsSummary['byModel'] = {};
    for (const r of byModelRows) {
      byModel[r.model] = {
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
      byModel,
    };
  }

  private periodToDate(period: 'day' | 'week' | 'month'): Date {
    const since = new Date();
    if (period === 'day') {
      since.setUTCHours(0, 0, 0, 0);
    } else if (period === 'week') {
      since.setUTCDate(since.getUTCDate() - 7);
    } else {
      since.setUTCDate(since.getUTCDate() - 30);
    }
    return since;
  }
}
