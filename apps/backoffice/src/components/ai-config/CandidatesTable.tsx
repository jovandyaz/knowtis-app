import { useMemo, useState } from 'react';

import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';

import { formatTokenCount, formatUsdPerMillionTokens } from '@/lib/format';

import {
  useAiCatalogCandidates,
  usePromoteCatalogModel,
  type CatalogModel,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  Input,
  MutationErrorAlert,
} from '@knowtis/design-system';
import { useDebounce } from '@knowtis/shared-hooks';
import type { ModelTier } from '@knowtis/shared-types';

import { isByokOnly } from './catalog-pricing';

/** One screenful next to the promoted table; the API caps requests at 100 rows. */
export const CANDIDATES_PAGE_SIZE = 10;

/** Only open-weight models reach the candidate list, so promotion always joins the open pool. */
const PROMOTION_TIER = 'open' as const satisfies ModelTier;

const columnHelper = createColumnHelper<CatalogModel>();

function candidateColumns(
  disabled: boolean,
  maxOutputCostPerToken: number,
  onPromote: (model: CatalogModel) => void
): ColumnDef<CatalogModel, unknown>[] {
  return [
    columnHelper.display({
      id: 'model',
      header: () => <span className="whitespace-nowrap">Model</span>,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            {row.original.label}
            {isByokOnly(row.original, maxOutputCostPerToken) ? (
              <Badge variant="outline">BYOK only</Badge>
            ) : null}
          </span>
          <span className="font-mono text-xs text-(--muted-foreground)">
            {row.original.id}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor('intelligenceIndex', {
      header: () => <span className="whitespace-nowrap">Intelligence</span>,
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap tabular-nums">
          {getValue() ?? '—'}
        </span>
      ),
    }),
    columnHelper.accessor('inputCostPerToken', {
      header: () => <span className="whitespace-nowrap">$/M in</span>,
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatUsdPerMillionTokens(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('outputCostPerToken', {
      header: () => <span className="whitespace-nowrap">$/M out</span>,
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatUsdPerMillionTokens(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('maxInputTokens', {
      header: () => <span className="whitespace-nowrap">Context</span>,
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatTokenCount(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('lastSeenAt', {
      header: () => <span className="whitespace-nowrap">Last seen</span>,
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap">
          {getValue().toLocaleDateString()}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'promote',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Promote ${row.original.label}`}
          onClick={() => onPromote(row.original)}
        >
          Promote
        </Button>
      ),
    }),
  ];
}

interface CandidatesTableProps {
  disabled?: boolean;
  maxOutputCostPerToken: number;
}

export function CandidatesTable({
  disabled = false,
  maxOutputCostPerToken,
}: CandidatesTableProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: CANDIDATES_PAGE_SIZE,
  });

  const promote = usePromoteCatalogModel();
  const candidates = useAiCatalogCandidates({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });

  const locked = disabled || promote.isPending;
  const promoteModel = promote.mutate;
  const columns = useMemo(
    () =>
      candidateColumns(locked, maxOutputCostPerToken, (model) =>
        promoteModel({ id: model.id, tier: PROMOTION_TIER })
      ),
    [locked, maxOutputCostPerToken, promoteModel]
  );

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium text-(--muted-foreground)">
          Candidates ({candidates.data?.total ?? 0})
        </h3>
        <Input
          type="search"
          aria-label="Search candidates"
          placeholder="Search a model…"
          className="sm:max-w-xs"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
      </div>
      <p className="text-xs text-(--muted-foreground)">
        Ranked by intelligence index, unscored last. A model marked “BYOK only”
        costs more per token than the free tier absorbs: promoting it offers it
        to users who bring their own key, not to everyone.
      </p>
      <MutationErrorAlert
        error={promote.error}
        isError={promote.isError}
        fallbackMessage="Could not promote the model."
      />
      {candidates.isError ? (
        <ErrorState
          message="Could not load candidates."
          onRetry={() => void candidates.refetch()}
          fullHeight={false}
        />
      ) : (
        <DataTable
          aria-label="Catalog candidates"
          columns={columns}
          data={candidates.data?.items ?? []}
          rowCount={candidates.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          isLoading={candidates.isLoading}
          emptyTitle="No candidates found"
          emptyDescription="Try a different search, or wait for the next sync."
        />
      )}
    </Card>
  );
}
