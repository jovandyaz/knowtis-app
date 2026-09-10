import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import {
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@knowtis/design-system';

const LINE_WIDTHS = ['w-11/12', 'w-4/5', 'w-3/5'];

interface ReasoningTailProps {
  detail: string;
  className?: string;
  tabIndex?: number;
  'aria-label'?: string;
}

/** The store keeps a rolling tail, so the viewport has to follow the newest
 * text; a plain clamp would pin the reader to the oldest line in the window. */
function ReasoningTail({ detail, className, ...props }: ReasoningTailProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [detail]);

  return (
    <div
      ref={ref}
      className={cn(
        'mt-1 break-words text-xs text-muted-foreground/70',
        className
      )}
      aria-live="off"
      {...props}
    >
      {detail}
    </div>
  );
}

interface AgentStatusIndicatorProps {
  detail?: string | undefined;
  answering?: boolean;
}

export function AgentStatusIndicator({
  detail,
  answering = false,
}: AgentStatusIndicatorProps) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);
  const reasoning = detail?.trim() ? detail : undefined;

  if (answering && !reasoning) {
    return null;
  }

  const label = t(answering ? 'ai.copilot.reasoning' : 'ai.copilot.thinking');

  return (
    <div className="flex flex-col gap-2">
      {reasoning ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {label}
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none',
                open && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          {open ? null : (
            <ReasoningTail
              detail={reasoning}
              className="max-h-12 overflow-hidden"
            />
          )}
          <CollapsibleContent>
            <ReasoningTail
              detail={reasoning}
              className="max-h-32 overflow-y-auto"
              tabIndex={0}
              aria-label={label}
            />
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <span role="status" className="text-xs text-muted-foreground">
          {label}
        </span>
      )}
      {!answering && (
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
      )}
    </div>
  );
}
