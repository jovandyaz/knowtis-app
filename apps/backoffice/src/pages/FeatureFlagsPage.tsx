import { TableSkeleton } from '@/components/TableSkeleton';

import { useUpsertFeatureFlag } from '@knowtis/data-access-admin';
import { useFeatureFlags } from '@knowtis/data-access-feature-flags';
import {
  EmptyState,
  ErrorState,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';

export function FeatureFlagsPage() {
  const flags = useFeatureFlags();
  const upsert = useUpsertFeatureFlag();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Feature Flags</h1>
      {flags.isError ? (
        <ErrorState
          message="Could not load feature flags."
          onRetry={() => void flags.refetch()}
          fullHeight={false}
        />
      ) : flags.isLoading ? (
        <TableSkeleton columns={4} />
      ) : !flags.data || flags.data.length === 0 ? (
        <EmptyState
          title="No flags"
          description="Flags appear once they are created via the API."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.data.map((flag) => (
              <TableRow key={flag.key}>
                <TableCell className="font-mono text-xs">{flag.key}</TableCell>
                <TableCell className="text-(--muted-foreground)">
                  {flag.description ?? '—'}
                </TableCell>
                <TableCell>
                  {new Date(flag.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={flag.enabled}
                    aria-label={flag.key}
                    disabled={
                      upsert.isPending && upsert.variables?.key === flag.key
                    }
                    onCheckedChange={(enabled) =>
                      upsert.mutate({
                        key: flag.key,
                        enabled,
                        ...(flag.description !== null && {
                          description: flag.description,
                        }),
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
