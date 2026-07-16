import { useState } from 'react';

import { BarList } from '@/components/charts/BarList';
import { StatCard } from '@/components/charts/StatCard';
import {
  TimeSeriesChart,
  type TimeSeriesMetric,
} from '@/components/charts/TimeSeriesChart';

import {
  METRICS_PERIODS,
  useGlobalAiMetrics,
  useGlobalAiTimeseries,
  type MetricsPeriod,
  type MetricsSummary,
} from '@knowtis/data-access-admin';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SegmentedControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';

const TIMESERIES_METRICS = ['cost', 'tokens', 'requests'] as const;

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function isMetricsPeriod(value: string): value is MetricsPeriod {
  return (METRICS_PERIODS as readonly string[]).includes(value);
}

function isTimeSeriesMetric(value: string): value is TimeSeriesMetric {
  return (TIMESERIES_METRICS as readonly string[]).includes(value);
}

function spendByModelItems(summary: MetricsSummary) {
  const entries = Object.entries(summary.byModel).sort(
    (a, b) => b[1].costUsd - a[1].costUsd
  );
  const totalCost = entries.reduce((acc, [, stats]) => acc + stats.costUsd, 0);
  return entries.map(([model, stats]) => ({
    label: model,
    value: stats.costUsd,
    displayValue: `${formatUsd(stats.costUsd)} · ${
      totalCost > 0 ? Math.round((stats.costUsd / totalCost) * 100) : 0
    }%`,
  }));
}

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
          idBase="ai-metrics-period"
          ariaLabel="Metrics period"
          value={period}
          onValueChange={(value) => {
            if (isMetricsPeriod(value)) {
              setPeriod(value);
            }
          }}
          items={METRICS_PERIODS.map((p) => ({ value: p, label: p }))}
        />
      </div>

      {metrics.isError ? (
        <ErrorState
          message="Could not load metrics."
          onRetry={() => void metrics.refetch()}
          fullHeight={false}
        />
      ) : metrics.isLoading || !summary ? (
        <LoadingState />
      ) : (
        <>
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

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-(--muted-foreground)">
                Over time
              </h2>
              <SegmentedControl
                idBase="ai-metrics-series"
                ariaLabel="Time series metric"
                value={metric}
                onValueChange={(value) => {
                  if (isTimeSeriesMetric(value)) {
                    setMetric(value);
                  }
                }}
                items={TIMESERIES_METRICS.map((m) => ({ value: m, label: m }))}
              />
            </div>
            {timeseries.isError ? (
              <ErrorState
                message="Could not load the time series."
                onRetry={() => void timeseries.refetch()}
                fullHeight={false}
              />
            ) : timeseries.isLoading || !timeseries.data ? (
              <LoadingState />
            ) : (
              <TimeSeriesChart
                buckets={timeseries.data.buckets}
                metric={metric}
                period={period}
              />
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-sm font-medium text-(--muted-foreground)">
                Spend by model
              </h2>
              {Object.keys(summary.byModel).length === 0 ? (
                <EmptyState
                  title="No activity"
                  description="No AI usage recorded for this period."
                />
              ) : (
                <BarList
                  ariaLabel="Spend by model"
                  items={spendByModelItems(summary)}
                />
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-4">
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
        </>
      )}
    </div>
  );
}
