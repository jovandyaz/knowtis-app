import { useTranslation } from 'react-i18next';

import type { QuotaState } from '@/hooks/useAiQuota';

import { cn } from '@knowtis/design-system';

interface QuotaCounterProps {
  quota: QuotaState;
}

export function QuotaCounter({ quota }: QuotaCounterProps) {
  const { t } = useTranslation('notes');

  if (quota.kind !== 'metered') {
    return null;
  }

  return (
    <span
      className={cn(
        'shrink-0 tabular-nums',
        quota.low ? 'font-medium text-warning' : 'text-muted-foreground'
      )}
    >
      {t('ai.copilot.quota.remaining', {
        count: Math.max(quota.limit - quota.used, 0),
      })}
    </span>
  );
}
