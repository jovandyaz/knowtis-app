import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import type { McpApiKey } from '@knowtis/api-client';
import { useMcpKeys } from '@knowtis/data-access-mcp-keys';
import { Badge, Button, cn, LoadingState } from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';
import { CreateKeyDialog } from './CreateKeyDialog';
import { McpConnectCard } from './McpConnectCard';
import { McpKeyRow } from './McpKeyRow';
import { RevokeKeyDialog } from './RevokeKeyDialog';

export function IntegrationsSection() {
  const { t, i18n } = useTranslation('common');
  const { data: keys, isLoading, isError } = useMcpKeys();
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

              {isError ? (
                <p className="rounded-lg border border-dashed border-(--destructive)/40 p-4 text-sm text-(--destructive)">
                  {t('errors.errorLoadingData')}
                </p>
              ) : hasKeys ? (
                <div className="space-y-3">
                  {keys.map((apiKey) => (
                    <McpKeyRow
                      key={apiKey.id}
                      apiKey={apiKey}
                      locale={i18n.language}
                      onRevoke={setRevokeTarget}
                    />
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
