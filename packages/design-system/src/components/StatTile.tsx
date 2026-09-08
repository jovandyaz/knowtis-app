import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import type { LearnTone } from '../constants/learn-tone';
import { cn } from '../utils';
import { CARD_SURFACE } from './Card';

export interface StatDelta {
  value: number;
  label: string;
}

export interface StatTileProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> {
  value: ReactNode;
  label: string;
  delta?: StatDelta;
  icon?: ReactNode;
}

type DeltaTone = Extract<LearnTone, 'correct' | 'muted' | 'incorrect'>;

const SIGN_TONE: Record<number, DeltaTone> = {
  1: 'correct',
  0: 'muted',
  '-1': 'incorrect',
};

const TONE_CLASS: Record<DeltaTone, string> = {
  correct: 'text-learn-correct',
  muted: 'text-(--muted-foreground)',
  incorrect: 'text-learn-incorrect',
};

function safeDelta(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function deltaClass(value: number): string {
  return TONE_CLASS[SIGN_TONE[Math.sign(safeDelta(value))]];
}

function formatDelta(value: number): string {
  const safe = safeDelta(value);
  return safe > 0 ? `+${safe}` : String(safe);
}

const StatTile = forwardRef<HTMLDivElement, StatTileProps>(
  ({ value, label, delta, icon, className, ...rest }, ref) => (
    <div
      ref={ref}
      {...rest}
      className={cn(CARD_SURFACE, 'flex flex-col gap-1 p-4', className)}
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
