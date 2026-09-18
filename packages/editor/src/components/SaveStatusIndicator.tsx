import {
  Check,
  CircleDashed,
  Loader2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@knowtis/design-system';

export type SaveStatus = 'pending' | 'saving' | 'saved' | 'error';

const STATUS_ICONS: Record<
  SaveStatus,
  { Icon: LucideIcon; className: string }
> = {
  pending: { Icon: CircleDashed, className: '' },
  saving: { Icon: Loader2, className: 'animate-spin' },
  saved: { Icon: Check, className: 'text-(--success)' },
  error: { Icon: TriangleAlert, className: 'text-(--destructive)' },
};

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
  const { Icon, className: iconClassName } = STATUS_ICONS[status];

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        transient && status === 'saved' && 'animate-fade-out',
        className
      )}
    >
      <Icon aria-hidden className={cn('h-3 w-3 shrink-0', iconClassName)} />
      {label && <span>{label}</span>}
    </div>
  );
}
