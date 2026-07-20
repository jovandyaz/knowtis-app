import { useTranslation } from 'react-i18next';

import { cn } from '@knowtis/design-system';

const LINE_WIDTHS = ['w-11/12', 'w-4/5', 'w-3/5'];

interface AgentStatusIndicatorProps {
  detail?: string | undefined;
}

export function AgentStatusIndicator({ detail }: AgentStatusIndicatorProps) {
  const { t } = useTranslation('notes');
  return (
    <div className="flex flex-col gap-2" role="status">
      <span className="text-xs text-muted-foreground">
        {t('ai.copilot.thinking')}
      </span>
      {detail ? (
        // Reasoning streams token by token inside role="status"; without opting
        // out of the live region every update would be announced aloud.
        <p
          className="line-clamp-3 break-words text-xs text-muted-foreground/70"
          aria-live="off"
        >
          {detail}
        </p>
      ) : null}
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
