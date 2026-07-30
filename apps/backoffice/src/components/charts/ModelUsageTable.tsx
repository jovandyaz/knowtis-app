import { formatUsd } from '@/lib/format';

import type { MetricsSummary } from '@knowtis/data-access-admin';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';

interface ModelUsageTableProps {
  byModel: MetricsSummary['byModel'];
}

export function ModelUsageTable({ byModel }: ModelUsageTableProps) {
  const rows = Object.entries(byModel).sort(
    (a, b) => b[1].costUsd - a[1].costUsd
  );
  const totalCostUsd = rows.reduce((acc, [, stats]) => acc + stats.costUsd, 0);

  return (
    <Table aria-label="By model">
      <TableHeader>
        <TableRow>
          <TableHead className="whitespace-nowrap">Model</TableHead>
          <TableHead className="whitespace-nowrap">Requests</TableHead>
          <TableHead className="whitespace-nowrap">Tokens</TableHead>
          <TableHead className="whitespace-nowrap">Cost</TableHead>
          <TableHead className="whitespace-nowrap">Avg / req</TableHead>
          <TableHead className="whitespace-nowrap">Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([model, stats]) => (
          <TableRow key={model}>
            {/* Provider-qualified ids run long enough to push Share out of the card. */}
            <TableCell className="max-w-[11rem] truncate" title={model}>
              {model}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {stats.requests.toLocaleString()}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {stats.tokens.toLocaleString()}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {formatUsd(stats.costUsd)}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {stats.requests > 0
                ? formatUsd(stats.costUsd / stats.requests)
                : '—'}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {totalCostUsd > 0
                ? `${Math.round((stats.costUsd / totalCostUsd) * 100)}%`
                : '0%'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
