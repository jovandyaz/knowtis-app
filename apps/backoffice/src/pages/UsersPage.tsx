import { useMemo, useState } from 'react';

import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';

import { RoleSelect } from '@/components/RoleSelect';

import { useAdminUsers, type AdminUser } from '@knowtis/data-access-admin';
import { Badge, DataTable, ErrorState, Input } from '@knowtis/design-system';
import { useDebounce } from '@knowtis/shared-hooks';

const columnHelper = createColumnHelper<AdminUser>();

const columns: ColumnDef<AdminUser, unknown>[] = [
  columnHelper.accessor('email', { header: 'Email' }),
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('role', {
    header: 'Role',
    cell: ({ row }) => <RoleSelect user={row.original} />,
    enableSorting: false,
  }),
  columnHelper.accessor('emailVerifiedAt', {
    header: 'Verified',
    cell: ({ getValue }) =>
      getValue() ? (
        <Badge variant="success">yes</Badge>
      ) : (
        <Badge variant="outline">no</Badge>
      ),
    enableSorting: false,
  }),
  columnHelper.accessor('createdAt', {
    header: 'Joined',
    cell: ({ getValue }) => getValue().toLocaleDateString(),
  }),
];

export function UsersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const params = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [pagination, debouncedSearch]
  );
  const users = useAdminUsers(params);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Input
          type="search"
          placeholder="Search by email…"
          className="sm:max-w-xs"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        />
      </div>
      {users.isError ? (
        <ErrorState
          message="Could not load users."
          onRetry={() => void users.refetch()}
          fullHeight={false}
        />
      ) : (
        <DataTable
          columns={columns}
          data={users.data?.items ?? []}
          rowCount={users.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          isLoading={users.isLoading}
          emptyTitle="No users found"
          emptyDescription="Try a different search."
        />
      )}
    </div>
  );
}
