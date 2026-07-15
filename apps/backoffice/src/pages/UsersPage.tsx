import { useMemo, useState } from 'react';

import type { ColumnDef, PaginationState } from '@tanstack/react-table';

import { RoleSelect } from '@/components/RoleSelect';

import { useAdminUsers, type AdminUser } from '@knowtis/data-access-admin';
import { Badge, DataTable, Input } from '@knowtis/design-system';

const columns: ColumnDef<AdminUser, unknown>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => <RoleSelect user={row.original} />,
    enableSorting: false,
  },
  {
    accessorKey: 'emailVerifiedAt',
    header: 'Verified',
    cell: ({ getValue }) =>
      getValue() ? (
        <Badge variant="success">yes</Badge>
      ) : (
        <Badge variant="outline">no</Badge>
      ),
    enableSorting: false,
  },
  {
    accessorKey: 'createdAt',
    header: 'Joined',
    cell: ({ getValue }) => (getValue() as Date).toLocaleDateString(),
  },
];

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const params = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      ...(search ? { search } : {}),
    }),
    [pagination, search]
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
    </div>
  );
}
