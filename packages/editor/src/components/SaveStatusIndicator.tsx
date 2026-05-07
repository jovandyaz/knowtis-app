import { Check, Loader2 } from 'lucide-react';

import { cn } from '@knowtis/design-system';

export type SaveStatus = 'saving' | 'saved';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  label?: string;
  className?: string;
  transient?: boolean;
}

export function SaveStatusIndicator({
  status,
  label,
  className,
  transient = false,
}: SaveStatusIndicatorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1',
        transient && status === 'saved' && 'animate-fade-out',
        className
      )}
    >
      {status === 'saving' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Check className="h-3 w-3 text-emerald-500" />
      )}
      {label && <span>{label}</span>}
    </div>
  );
}
