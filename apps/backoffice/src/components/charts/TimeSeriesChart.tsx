import type { CSSProperties } from 'react';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  MetricsPeriod,
  TimeseriesBucket,
} from '@knowtis/data-access-admin';

export type TimeSeriesMetric = 'cost' | 'tokens' | 'requests';

interface TimeSeriesChartProps {
  buckets: TimeseriesBucket[];
  metric: TimeSeriesMetric;
  period: MetricsPeriod;
}

const hourFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});
const dayFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const tooltipStyle: CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 12,
};

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' };

const metricColumns: Record<TimeSeriesMetric, string[]> = {
  cost: ['Cost (USD)'],
  tokens: ['Input tokens', 'Output tokens'],
  requests: ['Requests'],
};

function metricCells(
  metric: TimeSeriesMetric,
  bucket: TimeseriesBucket
): string[] {
  switch (metric) {
    case 'cost':
      return [`$${bucket.costUsd.toFixed(4)}`];
    case 'tokens':
      return [
        bucket.inputTokens.toLocaleString(),
        bucket.outputTokens.toLocaleString(),
      ];
    case 'requests':
      return [bucket.requests.toLocaleString()];
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${_exhaustive}`);
    }
  }
}

export function TimeSeriesChart({
  buckets,
  metric,
  period,
}: TimeSeriesChartProps) {
  const format = period === 'day' ? hourFormat : dayFormat;
  const data = buckets.map((bucket) => ({
    time: format.format(bucket.bucketStart),
    cost: bucket.costUsd,
    input: bucket.inputTokens,
    output: bucket.outputTokens,
    requests: bucket.requests,
  }));

  return (
    <div className="h-64 w-full">
      <table className="sr-only">
        <caption>{`${metric} over time for the selected period`}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {metricColumns[metric].map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => {
            const cells = metricCells(metric, bucket);
            return (
              <tr key={bucket.bucketStart.toISOString()}>
                <th scope="row">{format.format(bucket.bucketStart)}</th>
                {metricColumns[metric].map((column, index) => (
                  <td key={column}>{cells[index]}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="h-full w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {metric === 'cost' ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--muted)' }}
              />
              <Bar
                dataKey="cost"
                name="Cost (USD)"
                fill="var(--chart-1)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          ) : metric === 'tokens' ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="input"
                name="Input tokens"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.2}
              />
              <Area
                dataKey="output"
                name="Output tokens"
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.2}
              />
            </AreaChart>
          ) : (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="requests"
                name="Requests"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.2}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
