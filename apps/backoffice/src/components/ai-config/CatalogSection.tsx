import { formatUsdPerMillionTokens } from '@/lib/format';

import {
  useAiCatalog,
  usePromoteCatalogModel,
  useResolveCatalogAlert,
  useRetireCatalogModel,
  useSyncCatalog,
  useUpdateCatalogCopy,
  type CatalogModel,
  type CatalogSyncResult,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  MutationErrorAlert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';
import {
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  type CatalogSyncSkipReason,
  type ModelTier,
} from '@knowtis/shared-types';

import { CatalogAlerts } from './CatalogAlerts';
import { ConfigSection } from './ConfigSection';
import { PromotedTable } from './PromotedTable';

/** Only open-weight models reach the candidate list, so promotion always joins the open pool. */
const PROMOTION_TIER = 'open' as const satisfies ModelTier;

/** Unscored last: two thirds of the upstream list carry no index, and an unscored model is not a better bet than a scored one. */
function byIntelligenceDesc(a: CatalogModel, b: CatalogModel): number {
  if (a.intelligenceIndex === null) {
    return b.intelligenceIndex === null ? 0 : 1;
  }
  if (b.intelligenceIndex === null) {
    return -1;
  }
  return b.intelligenceIndex - a.intelligenceIndex;
}

/** Mirrors the server's access policy, where a negative stored price is a broken row rather than a discount. */
function isByokOnly(model: CatalogModel): boolean {
  return (
    model.outputCostPerToken < 0 ||
    model.outputCostPerToken > FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
  );
}

const SYNC_SKIP_MESSAGES: Record<string, string> = {
  flag_disabled: 'Skipped: the ai_catalog_sync flag is off.',
  locked: 'Skipped: another sync is already running.',
} satisfies Record<CatalogSyncSkipReason, string>;

function syncSummary(result: CatalogSyncResult): string {
  if (result.status === 'skipped') {
    return (
      SYNC_SKIP_MESSAGES[result.skippedReason ?? ''] ??
      'Skipped: nothing to do right now.'
    );
  }
  const failed =
    result.failures > 0 ? `, ${result.failures} write(s) failed` : '';
  return `Synced ${result.upstream} upstream models: ${result.candidates} candidate(s), ${result.alerts} alert(s)${failed}.`;
}

export function CatalogSection() {
  const catalog = useAiCatalog();
  const promote = usePromoteCatalogModel();
  const retire = useRetireCatalogModel();
  const updateCopy = useUpdateCatalogCopy();
  const resolveAlert = useResolveCatalogAlert();
  const sync = useSyncCatalog();

  const mutations = [promote, retire, updateCopy, resolveAlert, sync];
  const mutating = mutations.some((mutation) => mutation.isPending);
  const failed = mutations.find((mutation) => mutation.isError);

  const candidates = [...(catalog.data?.candidates ?? [])].sort(
    byIntelligenceDesc
  );
  const promoted = catalog.data?.promoted ?? [];
  const alerts = catalog.data?.alerts ?? [];

  return (
    <ConfigSection
      title="Model catalog"
      description="Open-weight models the sync found upstream. Promoting one publishes it to the model list; its stored price still decides who may run it."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => sync.mutate()}
          disabled={mutating}
        >
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      }
    >
      {catalog.isError ? (
        <ErrorState
          message="Could not load the model catalog."
          onRetry={() => void catalog.refetch()}
          fullHeight={false}
        />
      ) : catalog.isLoading || !catalog.data ? (
        <LoadingState />
      ) : (
        <>
          <MutationErrorAlert
            error={failed?.error ?? null}
            isError={!!failed}
            fallbackMessage="Could not apply the catalog change."
          />

          {sync.isSuccess && !sync.isPending ? (
            <p role="status" className="text-sm text-(--muted-foreground)">
              {syncSummary(sync.data)}
            </p>
          ) : null}

          <CatalogAlerts
            alerts={alerts}
            disabled={mutating}
            onResolve={(alertId) => resolveAlert.mutate(alertId)}
          />

          {/* min-w-0 on the card: grid and flex items default to min-width:auto,
              so a wide table widens the page instead of scrolling inside it. */}
          <Card className="flex min-w-0 flex-col gap-3 p-4">
            <h3 className="text-sm font-medium text-(--muted-foreground)">
              Candidates ({candidates.length})
            </h3>
            <p className="text-xs text-(--muted-foreground)">
              Ranked by intelligence index, unscored last. A model marked “BYOK
              only” costs more per token than the free tier absorbs: promoting
              it offers it to users who bring their own key, not to everyone.
            </p>
            {candidates.length === 0 ? (
              <EmptyState
                title="No candidates"
                description="The sync has not stored a promotable model yet."
                fullHeight={false}
              />
            ) : (
              <Table aria-label="Catalog candidates">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Model</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Intelligence
                    </TableHead>
                    <TableHead className="whitespace-nowrap">$/M in</TableHead>
                    <TableHead className="whitespace-nowrap">$/M out</TableHead>
                    <TableHead className="whitespace-nowrap">Context</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Last seen
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            {model.label}
                            {isByokOnly(model) ? (
                              <Badge variant="outline">BYOK only</Badge>
                            ) : null}
                          </span>
                          <span className="font-mono text-xs text-(--muted-foreground)">
                            {model.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {model.intelligenceIndex ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatUsdPerMillionTokens(model.inputCostPerToken)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatUsdPerMillionTokens(model.outputCostPerToken)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {model.maxInputTokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {model.lastSeenAt.toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={mutating}
                          aria-label={`Promote ${model.label}`}
                          onClick={() =>
                            promote.mutate({
                              id: model.id,
                              tier: PROMOTION_TIER,
                            })
                          }
                        >
                          Promote
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <PromotedTable
            models={promoted}
            disabled={mutating}
            onSave={({ id, label, description }) =>
              updateCopy.mutate({ id, patch: { label, description } })
            }
            onRetire={(id) => retire.mutate(id)}
          />
        </>
      )}
    </ConfigSection>
  );
}
