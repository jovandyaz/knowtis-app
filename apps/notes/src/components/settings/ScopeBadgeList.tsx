import { useTranslation } from 'react-i18next';

import { Badge } from '@knowtis/design-system';

import { SCOPE_LABEL_KEYS } from '../../lib/mcp-scopes';

export function ScopeBadgeList({ scopes }: { scopes: string[] }) {
  const { t } = useTranslation('common');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {scopes.map((scope) => (
        <Badge key={scope} variant="secondary">
          {t(SCOPE_LABEL_KEYS[scope] ?? scope, { defaultValue: scope })}
        </Badge>
      ))}
    </div>
  );
}
