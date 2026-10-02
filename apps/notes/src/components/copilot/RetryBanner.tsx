import { useTranslation } from 'react-i18next';

import { Button } from '@knowtis/design-system';

interface RetryBannerProps {
  message: string;
  /** Omitted when nothing may be retried: the banner then only reports. */
  onRetry?: () => void;
  action?: { label: string; onClick: () => void };
}

function BannerLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <>
      {' '}
      <Button
        type="button"
        variant="link"
        onClick={onClick}
        className="h-auto p-0 text-xs text-destructive underline underline-offset-2"
      >
        {children}
      </Button>
    </>
  );
}

export function RetryBanner({ message, onRetry, action }: RetryBannerProps) {
  const { t } = useTranslation('notes');

  return (
    <div role="alert" className="px-3 py-2 text-xs text-destructive">
      {message}
      {onRetry && (
        <BannerLink onClick={onRetry}>{t('ai.preview.retry')}</BannerLink>
      )}
      {action && (
        <BannerLink onClick={action.onClick}>{action.label}</BannerLink>
      )}
    </div>
  );
}
