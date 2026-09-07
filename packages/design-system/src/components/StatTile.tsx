import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../utils';

export interface StatDelta {
  value: number;
  label: string;
}

export interface StatTileProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'className' | 'children'
> {
  value: ReactNode;
  label: string;
  delta?: StatDelta;
  icon?: ReactNode;
  className?: string;
}

function deltaClass(value: number): string {
  if (value > 0) {
    return 'text-learn-correct';
  }
  if (value < 0) {
    return 'text-learn-incorrect';
  }
  return 'text-(--muted-foreground)';
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const StatTile = forwardRef<HTMLDivElement, StatTileProps>(
  ({ value, label, delta, icon, className, ...rest }, ref) => (
    <div
      ref={ref}
      {...rest}
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-(--border) bg-(--card) p-4 text-(--card-foreground)',
        className
      )}
    >
      <div className="flex items-center justify-between text-xs text-(--muted-foreground)">
        <span>{label}</span>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta ? (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'text-xs font-medium tabular-nums',
                deltaClass(delta.value)
              )}
            >
              {formatDelta(delta.value)}
            </span>
            <span className="sr-only">{delta.label}</span>
          </>
        ) : null}
      </div>
    </div>
  )
);
StatTile.displayName = 'StatTile';

export { StatTile };
