import { useTranslation } from 'react-i18next';

import { Button } from '@knowtis/design-system';

interface HistoryRetryRowProps {
  onRetry: () => void;
}

export function HistoryRetryRow({ onRetry }: HistoryRetryRowProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
      <span>{t('ai.copilot.history.earlierFailed')}</span>
      <Button
        type="button"
        variant="link"
        onClick={onRetry}
        className="h-auto p-0 text-xs"
      >
        {t('ai.copilot.history.retry')}
      </Button>
    </div>
  );
}
