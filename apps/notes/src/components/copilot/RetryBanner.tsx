import { useTranslation } from 'react-i18next';

import { Button } from '@knowtis/design-system';

interface RetryBannerProps {
  message: string;
  onRetry: () => void;
}

export function RetryBanner({ message, onRetry }: RetryBannerProps) {
  const { t } = useTranslation('notes');

  return (
    <div role="alert" className="px-3 py-2 text-xs text-destructive">
      {message}{' '}
      <Button
        type="button"
        variant="link"
        onClick={onRetry}
        className="h-auto p-0 text-xs text-destructive underline underline-offset-2"
      >
        {t('ai.preview.retry')}
      </Button>
    </div>
  );
}
