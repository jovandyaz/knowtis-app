import { useTranslation } from 'react-i18next';

import type { McpApiKey } from '@knowtis/api-client';
import { Badge, Button } from '@knowtis/design-system';

import { SCOPE_LABEL_KEYS } from '../../../lib/mcp-scopes';

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface McpKeyRowProps {
  apiKey: McpApiKey;
  locale: string;
  onRevoke: (apiKey: McpApiKey) => void;
}

export function McpKeyRow({ apiKey, locale, onRevoke }: McpKeyRowProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-(--border) p-4">
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
                {t(SCOPE_LABEL_KEYS[scope] ?? scope, { defaultValue: scope })}
              </Badge>
            );
          })}
        </div>
        <div className="flex gap-4 text-xs text-(--muted-foreground)">
          <span>
            {t('integrations.createdAt')} {formatDate(apiKey.createdAt, locale)}
          </span>
          <span>
            {t('integrations.lastUsed')}{' '}
            {apiKey.lastUsedAt
              ? formatDate(apiKey.lastUsedAt, locale)
              : t('integrations.never')}
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => onRevoke(apiKey)}
      >
        {t('integrations.revoke')}
      </Button>
    </div>
  );
}
