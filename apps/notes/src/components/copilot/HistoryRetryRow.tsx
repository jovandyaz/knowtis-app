import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { Button } from '@knowtis/design-system';

interface HistoryRetryRowProps {
  onRetry: () => void;
  /** The retry is running: the button keeps focus but ignores presses. */
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function HistoryRetryRow({
  onRetry,
  busy = false,
  ref,
}: HistoryRetryRowProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
      <span>{t('ai.copilot.history.earlierFailed')}</span>
      <Button
        ref={ref}
        type="button"
        variant="link"
        aria-disabled={busy}
        aria-busy={busy}
        onClick={busy ? undefined : onRetry}
        className="h-auto gap-1 p-0 text-xs"
      >
        {busy && (
          <Loader2
            aria-hidden
            className="h-3 w-3 animate-spin motion-reduce:animate-none"
          />
        )}
        {busy ? tCommon('states.loading') : t('ai.copilot.history.retry')}
      </Button>
    </div>
  );
}
