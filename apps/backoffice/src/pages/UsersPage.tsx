import { useMemo, useState } from 'react';

import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';

import { RoleSelect } from '@/components/RoleSelect';

import { useAdminUsers, type AdminUser } from '@knowtis/data-access-admin';
import {
  Badge,
  DataTable,
  ErrorState,
  Input,
  SegmentedControl,
} from '@knowtis/design-system';
import { useDebounce } from '@knowtis/shared-hooks';

const columnHelper = createColumnHelper<AdminUser>();

const ROLE_FILTERS = ['all', 'admin', 'user'] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

function isRoleFilter(value: string): value is RoleFilter {
  return (ROLE_FILTERS as readonly string[]).includes(value);
}

function initialsOf(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

const columns: ColumnDef<AdminUser, unknown>[] = [
  columnHelper.display({
    id: 'user',
    header: 'User',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        {row.original.avatarUrl ? (
          <img
            src={row.original.avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--muted) text-xs font-medium"
          >
            {initialsOf(row.original.name, row.original.email)}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {row.original.name || '—'}
          </span>
          <span className="truncate text-xs text-(--muted-foreground)">
            {row.original.email}
          </span>
        </span>
      </div>
    ),
  }),
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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const params = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(roleFilter !== 'all' ? { role: roleFilter } : {}),
    }),
    [pagination, debouncedSearch, roleFilter]
  );
  const users = useAdminUsers(params);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl
            idBase="users-role-filter"
            ariaLabel="Filter by role"
            value={roleFilter}
            onValueChange={(value) => {
              if (isRoleFilter(value)) {
                setRoleFilter(value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }
            }}
            items={ROLE_FILTERS.map((r) => ({ value: r, label: r }))}
          />
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
