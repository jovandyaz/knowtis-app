import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import {
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@knowtis/design-system';

const LINE_WIDTHS = ['w-11/12', 'w-4/5', 'w-3/5'];

interface AgentStatusIndicatorProps {
  detail?: string | undefined;
}

export function AgentStatusIndicator({ detail }: AgentStatusIndicatorProps) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2" role="status">
      {detail ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label={t('ai.copilot.reasoning')}
          >
            {t('ai.copilot.thinking')}
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none',
                open && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          {open ? null : (
            <p
              className="mt-1 line-clamp-3 break-words text-xs text-muted-foreground/70"
              aria-live="off"
            >
              {detail}
            </p>
          )}
          <CollapsibleContent
            className="mt-1 max-h-32 overflow-y-auto break-words text-xs text-muted-foreground/70"
            aria-live="off"
          >
            {detail}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <span className="text-xs text-muted-foreground">
          {t('ai.copilot.thinking')}
        </span>
      )}
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
