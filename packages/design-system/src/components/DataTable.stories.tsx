import { useState } from 'react';

import type { ColumnDef, PaginationState } from '@tanstack/react-table';

import type { Meta, StoryObj } from '@storybook/react';

import { DataTable } from './DataTable';

interface Row {
  name: string;
  role: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
];

const roles = ['admin', 'user', 'editor'];

const data: Row[] = Array.from({ length: 30 }, (_, index) => ({
  name: `User ${index + 1}`,
  role: roles[index % roles.length],
}));

const meta: Meta<typeof DataTable<Row>> = {
  title: 'Components/DataTable',
  component: DataTable,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DataTable<Row>>;

export const Default: Story = {
  args: {
    columns,
    data,
  },
};

export const Loading: Story = {
  args: {
    columns,
    data: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    columns,
    data: [],
    emptyTitle: 'No users',
    emptyDescription: 'Nothing matches your filters.',
  },
};

const allRows = data.concat(data).concat(data).concat(data);

function ServerPaginatedExample() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const start = pagination.pageIndex * pagination.pageSize;
  const page = allRows.slice(start, start + pagination.pageSize);

  return (
    <DataTable
      columns={columns}
      data={page}
      rowCount={120}
      pagination={pagination}
      onPaginationChange={setPagination}
    />
  );
}

export const ServerPaginated: Story = {
  render: () => <ServerPaginatedExample />,
};
