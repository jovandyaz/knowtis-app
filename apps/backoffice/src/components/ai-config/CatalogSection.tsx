import {
  useAiCatalog,
  useAiConfig,
  useResolveCatalogAlert,
  useRetireCatalogModel,
  useSyncCatalog,
  useUpdateCatalogCopy,
  type CatalogSyncResult,
} from '@knowtis/data-access-admin';
import {
  Button,
  ErrorState,
  LoadingState,
  MutationErrorAlert,
} from '@knowtis/design-system';
import type { CatalogSyncSkipReason } from '@knowtis/shared-types';

import { CandidatesTable } from './CandidatesTable';
import { freeTierCeilingFrom } from './catalog-pricing';
import { CatalogAlerts } from './CatalogAlerts';
import { ConfigSection } from './ConfigSection';
import { PromotedTable } from './PromotedTable';
import { servingRolesFrom } from './serving-roles';

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
  const config = useAiConfig();
  const retire = useRetireCatalogModel();
  const updateCopy = useUpdateCatalogCopy();
  const resolveAlert = useResolveCatalogAlert();
  const sync = useSyncCatalog();

  const mutations = [retire, updateCopy, resolveAlert, sync];
  const mutating = mutations.some((mutation) => mutation.isPending);
  const failed = mutations.find((mutation) => mutation.isError);

  const overview = catalog.isError ? null : (catalog.data ?? null);
  const maxOutputCostPerToken = freeTierCeilingFrom(config.data);
  const servingRoles = config.data ? servingRolesFrom(config.data) : null;

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
      ) : overview ? (
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
            alerts={overview.alerts}
            disabled={mutating}
            onResolve={(alertId) => resolveAlert.mutate(alertId)}
          />
        </>
      ) : (
        <LoadingState />
      )}

      <CandidatesTable
        disabled={mutating}
        maxOutputCostPerToken={maxOutputCostPerToken}
      />

      {overview ? (
        <PromotedTable
          models={overview.promoted}
          disabled={mutating}
          maxOutputCostPerToken={maxOutputCostPerToken}
          servingRoles={servingRoles}
          onSave={({ id, label, description }) =>
            updateCopy.mutate({ id, patch: { label, description } })
          }
          onRetire={(id) => retire.mutate(id)}
        />
      ) : null}
    </ConfigSection>
  );
}
