import { useTranslation } from 'react-i18next';

import { cn } from '@knowtis/design-system';

const LINE_WIDTHS = ['w-11/12', 'w-4/5', 'w-3/5'];

export function AgentStatusIndicator() {
  const { t } = useTranslation('notes');
  return (
    <div className="flex flex-col gap-2" role="status">
      <span className="text-xs text-muted-foreground">
        {t('ai.copilot.thinking')}
      </span>
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        {LINE_WIDTHS.map((w, i) => (
          <span
            key={i}
            data-testid="shimmer-line"
            className={cn(
              'h-2.5 rounded bg-muted',
              'animate-pulse motion-reduce:animate-none',
              w
            )}
          />
        ))}
      </div>
    </div>
  );
}
