import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import type { McpApiKey } from '@knowtis/api-client';
import { useMcpKeys } from '@knowtis/data-access-mcp-keys';
import { Badge, Button, cn, LoadingState } from '@knowtis/design-system';

import { SCOPE_LABEL_KEYS } from '../../../lib/mcp-scopes';
import { SectionHeader } from '../SectionHeader';
import { CreateKeyDialog } from './CreateKeyDialog';
import { McpConnectCard } from './McpConnectCard';
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<McpApiKey | null>(null);

  const hasKeys = !!keys && keys.length > 0;
  const ChevronIcon = advancedOpen ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('integrations.title')}
        description={t('integrations.description')}
      />

      <McpConnectCard />

      <div className="space-y-4 border-t border-(--border) pt-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          aria-controls="mcp-api-keys"
          className="flex w-full items-center gap-2 text-left"
        >
          <ChevronIcon
            className="h-4 w-4 text-(--muted-foreground)"
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-(--foreground)">
            {t('integrations.advancedTitle')}
          </span>
          {hasKeys && (
            <Badge variant="secondary" className="ml-1">
              {keys.length}
            </Badge>
          )}
        </button>

        <div
          id="mcp-api-keys"
          className={cn('space-y-4', !advancedOpen && 'hidden')}
        >
          <p className="text-sm text-(--muted-foreground)">
            {t('integrations.advancedDescription')}
          </p>

          {isLoading ? (
            <LoadingState fullHeight={false} size="sm" />
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('integrations.createKey')}
                </Button>
              </div>

              {hasKeys ? (
                <div className="space-y-3">
                  {keys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-(--border) p-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-(--foreground)">
                            {apiKey.name}
                          </span>
                          <code className="rounded bg-(--muted) px-1.5 py-0.5 font-mono text-xs text-(--muted-foreground)">
                            {apiKey.keyPrefix}
                          </code>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {apiKey.scopes.split(',').map((rawScope) => {
                            const scope = rawScope.trim();
                            return (
                              <Badge key={scope} variant="secondary">
                                {t(SCOPE_LABEL_KEYS[scope] ?? scope, {
                                  defaultValue: scope,
                                })}
                              </Badge>
                            );
                          })}
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
              ) : (
                <p className="rounded-lg border border-dashed border-(--border) p-4 text-sm text-(--muted-foreground)">
                  {t('integrations.emptyDescription')}
                </p>
              )}
            </>
          )}
        </div>
      </div>

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
