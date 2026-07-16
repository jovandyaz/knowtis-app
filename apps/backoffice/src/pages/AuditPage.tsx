import { useMemo, useState } from 'react';

import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';

import { useAuditLog, type AuditEntry } from '@knowtis/data-access-admin';
import { DataTable, ErrorState } from '@knowtis/design-system';

const columnHelper = createColumnHelper<AuditEntry>();

function formatChange(entry: AuditEntry): string {
  const before = entry.before ? JSON.stringify(entry.before) : '—';
  const after = entry.after ? JSON.stringify(entry.after) : '—';
  return `${before} → ${after}`;
}

const columns: ColumnDef<AuditEntry, unknown>[] = [
  columnHelper.accessor('createdAt', {
    header: 'When',
    cell: ({ getValue }) => getValue().toLocaleString(),
  }),
  columnHelper.accessor('actorEmail', {
    header: 'Actor',
    cell: ({ row }) => row.original.actorEmail ?? row.original.actorId,
    enableSorting: false,
  }),
  columnHelper.accessor('action', { header: 'Action' }),
  columnHelper.display({
    id: 'target',
    header: 'Target',
    cell: ({ row }) =>
      row.original.targetId
        ? `${row.original.targetType}: ${row.original.targetId}`
        : row.original.targetType,
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'change',
    header: 'Change',
    cell: ({ row }) => formatChange(row.original),
    enableSorting: false,
  }),
];

export function AuditPage() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const params = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
    }),
    [pagination]
  );
  const audit = useAuditLog(params);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      {audit.isError ? (
        <ErrorState
          message="Could not load audit log."
          onRetry={() => void audit.refetch()}
          fullHeight={false}
        />
      ) : (
        <DataTable
          columns={columns}
          data={audit.data?.items ?? []}
          rowCount={audit.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          isLoading={audit.isLoading}
          emptyTitle="No audit entries found"
        />
      )}
    </div>
  );
}
