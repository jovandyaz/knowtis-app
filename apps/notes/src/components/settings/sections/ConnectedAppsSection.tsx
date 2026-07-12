import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Plug } from 'lucide-react';

import {
  isOauthDisabledError,
  useOauthGrants,
  type OauthGrant,
} from '@knowtis/data-access-oauth';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@knowtis/design-system';

import { formatDate } from '../../../lib/format-date';
import { ScopeBadgeList } from '../ScopeBadgeList';
import { SectionHeader } from '../SectionHeader';
import { RevokeGrantDialog } from './RevokeGrantDialog';

function hostFromClientId(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}

export function ConnectedAppsSection() {
  const { t, i18n } = useTranslation('common');
  const { data: grants, isLoading, isError, error } = useOauthGrants();
  const [revokeTarget, setRevokeTarget] = useState<OauthGrant | null>(null);

  // A terminal 404 means the MCP OAuth flag is off — hide the section entirely.
  if (isOauthDisabledError(error)) {
    return null;
  }

  const header = (
    <SectionHeader
      title={t('connectedApps.title')}
      description={t('connectedApps.description')}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState fullHeight={false} size="sm" />
      </div>
    );
  }

  // Any other failure (5xx / network / auth) is transient — surface it instead
  // of silently hiding a feature the user actually has access to.
  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          title={t('connectedApps.errorTitle')}
          message={t('connectedApps.errorDescription')}
          fullHeight={false}
        />
      </div>
    );
  }

  const hasGrants = grants && grants.length > 0;

  return (
    <div className="space-y-6">
      {header}

      {hasGrants ? (
        <div className="space-y-3">
          {grants.map((grant) => {
            const appName =
              grant.clientName || hostFromClientId(grant.clientId);
            return (
              <div
                key={grant.grantId}
                className="flex flex-col gap-3 rounded-lg border border-(--border) p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <span className="block truncate font-medium text-(--foreground)">
                    {appName}
                  </span>
                  <ScopeBadgeList scopes={grant.scopes} />
                  <div className="text-xs text-(--muted-foreground)">
                    {t('connectedApps.authorizedAt')}{' '}
                    {formatDate(grant.createdAt, i18n.language)}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setRevokeTarget(grant)}
                >
                  {t('connectedApps.revoke')}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Plug className="h-8 w-8 text-(--muted-foreground)" />}
          title={t('connectedApps.emptyTitle')}
          description={t('connectedApps.emptyDescription')}
          fullHeight={false}
        />
      )}

      {revokeTarget && (
        <RevokeGrantDialog
          open={!!revokeTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRevokeTarget(null);
            }
          }}
          grantId={revokeTarget.grantId}
          appName={
            revokeTarget.clientName || hostFromClientId(revokeTarget.clientId)
          }
        />
      )}
    </div>
  );
}
