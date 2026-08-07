import { useState } from 'react';

import { ModelUsageTable } from '@/components/charts/ModelUsageTable';
import { StatCard } from '@/components/charts/StatCard';
import { StatCardsSkeleton } from '@/components/charts/StatCardsSkeleton';
import {
  TimeSeriesChart,
  type TimeSeriesMetric,
} from '@/components/charts/TimeSeriesChart';
import { formatUsd } from '@/lib/format';

import {
  METRICS_PERIODS,
  useGlobalAiMetrics,
  useGlobalAiTimeseries,
  type MetricsPeriod,
} from '@knowtis/data-access-admin';
import {
  Card,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';

const TIMESERIES_METRICS = ['cost', 'tokens', 'requests'] as const;

export function AiMetricsPage() {
  const [period, setPeriod] = useState<MetricsPeriod>('day');
  const [metric, setMetric] = useState<TimeSeriesMetric>('cost');
  const metrics = useGlobalAiMetrics(period);
  const timeseries = useGlobalAiTimeseries(period);

  const summary = metrics.data;
  const avgCost =
    summary && summary.totalRequests > 0
      ? formatUsd(summary.totalCostUsd / summary.totalRequests)
      : '—';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Metrics</h1>
        <SegmentedControl
          aria-label="Metrics period"
          value={period}
          onValueChange={setPeriod}
          options={METRICS_PERIODS.map((p) => ({ value: p, label: p }))}
        />
      </div>

      {metrics.isError ? (
        <ErrorState
          message="Could not load metrics."
          onRetry={() => void metrics.refetch()}
          fullHeight={false}
        />
      ) : metrics.isLoading || !summary ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Requests"
            value={summary.totalRequests.toLocaleString()}
          />
          <StatCard
            label="Tokens"
            value={(
              summary.totalInputTokens + summary.totalOutputTokens
            ).toLocaleString()}
            hint={`${summary.totalInputTokens.toLocaleString()} in · ${summary.totalOutputTokens.toLocaleString()} out`}
          />
          <StatCard label="Cost" value={formatUsd(summary.totalCostUsd)} />
          <StatCard label="Avg cost / request" value={avgCost} />
        </div>
      )}

      <Card className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-(--muted-foreground)">
            Over time
          </h2>
          <SegmentedControl
            aria-label="Time series metric"
            value={metric}
            onValueChange={setMetric}
            options={TIMESERIES_METRICS.map((m) => ({ value: m, label: m }))}
          />
        </div>
        {timeseries.isError ? (
          <ErrorState
            message="Could not load the time series."
            onRetry={() => void timeseries.refetch()}
            fullHeight={false}
          />
        ) : timeseries.isLoading || !timeseries.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <TimeSeriesChart
            buckets={timeseries.data.buckets}
            metric={metric}
            period={period}
          />
        )}
      </Card>

      {summary && !metrics.isError && !metrics.isLoading && (
        // min-w-0 on the cards: grid items default to min-width:auto, so a wide
        // table widens the page instead of scrolling inside its own card.
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex min-w-0 flex-col gap-3 p-4">
            <h2 className="text-sm font-medium text-(--muted-foreground)">
              By model
            </h2>
            {Object.keys(summary.byModel).length === 0 ? (
              <EmptyState
                title="No activity"
                description="No AI usage recorded for this period."
              />
            ) : (
              <ModelUsageTable byModel={summary.byModel} />
            )}
          </Card>

          <Card className="flex min-w-0 flex-col gap-3 p-4">
            <h2 className="text-sm font-medium text-(--muted-foreground)">
              By action
            </h2>
            {Object.keys(summary.byAction).length === 0 ? (
              <EmptyState
                title="No activity"
                description="No AI actions recorded for this period."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(summary.byAction).map(([action, stats]) => (
                    <TableRow key={action}>
                      <TableCell>{action}</TableCell>
                      <TableCell>{stats.requests}</TableCell>
                      <TableCell>{stats.tokens.toLocaleString()}</TableCell>
                      <TableCell>{formatUsd(stats.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
