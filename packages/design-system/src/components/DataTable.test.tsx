import type { ColumnDef } from '@tanstack/react-table';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from './DataTable';

interface Row {
  name: string;
  role: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
];

const data: Row[] = [
  { name: 'Ada', role: 'admin' },
  { name: 'Grace', role: 'user' },
];

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(
      screen.getByRole('columnheader', { name: 'Name' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('shows the empty state when there is no data', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="No users"
        emptyDescription="Nothing matches."
      />
    );
    expect(screen.getByText('No users')).toBeInTheDocument();
  });

  it('shows the loading state while loading', () => {
    render(<DataTable columns={columns} data={[]} isLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('drives server pagination through the callback', () => {
    const onPaginationChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowCount={50}
        pagination={{ pageIndex: 0, pageSize: 25 }}
        onPaginationChange={onPaginationChange}
      />
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPaginationChange).toHaveBeenCalled();
  });

  it('disables Previous on the first page and Next on the last', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        rowCount={2}
        pagination={{ pageIndex: 0, pageSize: 25 }}
        onPaginationChange={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /previous page/i })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('sorts rows ascending then descending when the Name header is clicked', () => {
    const unsortedData: Row[] = [
      { name: 'Grace', role: 'admin' },
      { name: 'Ada', role: 'user' },
      { name: 'Linus', role: 'editor' },
    ];
    render(<DataTable columns={columns} data={unsortedData} />);

    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    const sortButton = within(nameHeader).getByRole('button', {
      name: 'Name',
    });

    fireEvent.click(sortButton);
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    let rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Ada');
    expect(rows[2]).toHaveTextContent('Grace');
    expect(rows[3]).toHaveTextContent('Linus');

    fireEvent.click(sortButton);
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Linus');
    expect(rows[2]).toHaveTextContent('Grace');
    expect(rows[3]).toHaveTextContent('Ada');
  });

  it('does not render a sort button on headers in server-paginated mode', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        rowCount={2}
        pagination={{ pageIndex: 0, pageSize: 25 }}
        onPaginationChange={vi.fn()}
      />
    );
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(within(nameHeader).queryByRole('button')).not.toBeInTheDocument();
  });
});
