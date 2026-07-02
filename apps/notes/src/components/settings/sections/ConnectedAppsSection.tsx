import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Plug } from 'lucide-react';

import { useOauthGrants, type OauthGrant } from '@knowtis/data-access-oauth';
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
} from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';
import { RevokeGrantDialog } from './RevokeGrantDialog';

const SCOPE_LABEL_KEYS: Record<string, string> = {
  'notes:read': 'oauth.scopes.notesRead',
  'notes:write': 'oauth.scopes.notesWrite',
  'notes:share': 'oauth.scopes.notesShare',
  offline_access: 'oauth.scopes.offlineAccess',
};

function hostFromClientId(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}

function formatDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr));
}

export function ConnectedAppsSection() {
  const { t, i18n } = useTranslation('common');
  const { data: grants, isLoading, isError } = useOauthGrants();
  const [revokeTarget, setRevokeTarget] = useState<OauthGrant | null>(null);

  // A 404 means the MCP OAuth flag is off — hide the section entirely.
  if (isError) {
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

  const hasGrants = grants && grants.length > 0;

  return (
    <div className="space-y-6">
      {header}

      {hasGrants ? (
        <div className="space-y-3">
          {grants.map((grant) => {
            const appName =
              grant.clientName ?? hostFromClientId(grant.clientId);
            return (
              <div
                key={grant.grantId}
                className="flex flex-col gap-3 rounded-lg border border-(--border) p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <span className="block truncate font-medium text-(--foreground)">
                    {appName}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {grant.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary">
                        {t(SCOPE_LABEL_KEYS[scope] ?? scope, {
                          defaultValue: scope,
                        })}
                      </Badge>
                    ))}
                  </div>
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
            revokeTarget.clientName ?? hostFromClientId(revokeTarget.clientId)
          }
        />
      )}
    </div>
  );
}
