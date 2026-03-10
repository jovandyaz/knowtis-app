import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Key, Plus } from 'lucide-react';

import type { McpApiKey } from '@knowtis/api-client';
import { useMcpKeys } from '@knowtis/data-access-mcp-keys';
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
} from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';
import { CreateKeyDialog } from './CreateKeyDialog';
import { RevokeKeyDialog } from './RevokeKeyDialog';

function formatDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr));
}

export function IntegrationsSection() {
  const { t, i18n } = useTranslation('common');
  const { data: keys, isLoading } = useMcpKeys();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<McpApiKey | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={t('integrations.title')}
          description={t('integrations.description')}
        />
        <LoadingState fullHeight={false} size="sm" />
      </div>
    );
  }

  const hasKeys = keys && keys.length > 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('integrations.title')}
        description={t('integrations.description')}
      />

      {hasKeys ? (
        <>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('integrations.createKey')}
            </Button>
          </div>

          <div className="space-y-3">
            {keys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-(--border) p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-(--foreground) truncate">
                      {apiKey.name}
                    </span>
                    <code className="rounded bg-(--muted) px-1.5 py-0.5 font-mono text-xs text-(--muted-foreground)">
                      {apiKey.keyPrefix}
                    </code>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {apiKey.scopes.split(',').map((scope) => (
                      <Badge key={scope} variant="secondary">
                        {scope.trim()}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-4 text-xs text-(--muted-foreground)">
                    <span>
                      {t('integrations.createdAt')}{' '}
                      {formatDate(apiKey.createdAt, i18n.language)}
                    </span>
                    <span>
                      {t('integrations.lastUsed')}{' '}
                      {apiKey.lastUsedAt
                        ? formatDate(apiKey.lastUsedAt, i18n.language)
                        : t('integrations.never')}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setRevokeTarget(apiKey)}
                >
                  {t('integrations.revoke')}
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Key className="h-8 w-8 text-(--muted-foreground)" />}
          title={t('integrations.emptyTitle')}
          description={t('integrations.emptyDescription')}
          action={{
            label: t('integrations.createKey'),
            onClick: () => setCreateOpen(true),
          }}
          fullHeight={false}
        />
      )}

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />

      {revokeTarget && (
        <RevokeKeyDialog
          open={!!revokeTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRevokeTarget(null);
            }
          }}
          keyId={revokeTarget.id}
          keyName={revokeTarget.name}
        />
      )}
    </div>
  );
}
