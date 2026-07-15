import { useState } from 'react';

import {
  METRICS_PERIODS,
  useGlobalAiMetrics,
  useGlobalAiUsage,
  type MetricsPeriod,
} from '@knowtis/data-access-admin';
import {
  Card,
  LoadingState,
  SegmentedControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-(--muted-foreground)">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </Card>
  );
}

export function AiMetricsPage() {
  const [period, setPeriod] = useState<MetricsPeriod>('day');
  const usage = useGlobalAiUsage();
  const metrics = useGlobalAiMetrics(period);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">AI Metrics</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-(--muted-foreground)">Today</h2>
        {usage.isLoading || !usage.data ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Requests"
              value={String(usage.data.requestCount)}
            />
            <StatCard
              label="Input tokens"
              value={usage.data.totalInputTokens.toLocaleString()}
            />
            <StatCard
              label="Output tokens"
              value={usage.data.totalOutputTokens.toLocaleString()}
            />
            <StatCard label="Cost" value={formatUsd(usage.data.totalCostUsd)} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-(--muted-foreground)">
            By action
          </h2>
          <SegmentedControl
            idBase="ai-metrics-period"
            ariaLabel="Metrics period"
            value={period}
            onValueChange={(value) => setPeriod(value as MetricsPeriod)}
            items={METRICS_PERIODS.map((p) => ({ value: p, label: p }))}
          />
        </div>
        {metrics.isLoading || !metrics.data ? (
          <LoadingState />
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
              {Object.entries(metrics.data.byAction).map(([action, stats]) => (
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
      </section>
    </div>
  );
}
