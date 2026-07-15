import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './Table';

interface DataTableBaseProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

type DataTablePaginationProps =
  | {
      rowCount: number;
      pagination: PaginationState;
      onPaginationChange: OnChangeFn<PaginationState>;
    }
  | {
      rowCount?: never;
      pagination?: never;
      onPaginationChange?: never;
    };

export type DataTableProps<TData, TValue = unknown> =
  DataTableBaseProps<TData, TValue> & DataTablePaginationProps;

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  rowCount,
  pagination,
  onPaginationChange,
  isLoading = false,
  emptyTitle = 'No results',
  emptyDescription,
}: DataTableProps<TData, TValue>) {
  const isServerPaginated =
    pagination !== undefined &&
    onPaginationChange !== undefined &&
    rowCount !== undefined;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerPaginated
      ? {
          manualPagination: true,
          rowCount,
          state: { pagination },
          onPaginationChange,
          enableSorting: false,
        }
      : {
          getPaginationRowModel: getPaginationRowModel(),
          getSortedRowModel: getSortedRowModel(),
        }),
  });

  if (isLoading) {
    return <LoadingState />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        {...(emptyDescription === undefined
          ? {}
          : { description: emptyDescription })}
      />
    );
  }

  const showPagination = isServerPaginated || table.getPageCount() > 1;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const headerContent = header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    );

                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-(--foreground)"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {headerContent}
                        <span aria-hidden="true">
                          {{ asc: '↑', desc: '↓' }[
                            header.column.getIsSorted() as string
                          ] ?? null}
                        </span>
                      </button>
                    ) : (
                      headerContent
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {showPagination ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-(--muted-foreground)">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {Math.max(table.getPageCount(), 1)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
