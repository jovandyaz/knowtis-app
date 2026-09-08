import { forwardRef, type HTMLAttributes } from 'react';

import { cva } from 'class-variance-authority';

import type { PredictedIntervals, SM2Quality } from '@knowtis/shared-types';

import {
  RATING_ORDER,
  RATING_QUALITY,
  type RatingKey,
} from '../constants/rating';
import { cn } from '../utils';
import { Kbd } from './Kbd';

const ratingButton = cva(
  'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 text-sm font-medium ring-1 transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      rating: {
        again:
          'bg-learn-incorrect/15 text-learn-incorrect-text ring-learn-incorrect/25 hover:bg-learn-incorrect/25',
        hard: 'bg-(--muted) text-(--foreground) ring-(--border) hover:bg-(--accent)',
        good: 'bg-learn-correct/15 text-learn-correct-text ring-learn-correct/25 hover:bg-learn-correct/25',
        easy: 'bg-(--primary)/15 text-(--primary) ring-(--primary)/25 hover:bg-(--primary)/25',
      },
    },
  }
);

export interface RatingBarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'role' | 'aria-label'
> {
  /** Accessible name for the rating group (e.g. "Rate this card"). */
  label: string;
  intervals: PredictedIntervals;
  labels: Record<RatingKey, string>;
  formatInterval: (days: number) => string;
  onRate: (quality: SM2Quality) => void;
  disabled?: boolean;
  /** Renders the predicted interval under each label; off for layouts too narrow to carry it. */
  showIntervals?: boolean;
  showKeys?: boolean;
}

/**
 * Four-button SM-2 rating strip. Captions showing the predicted interval are
 * hidden when every rating predicts the same interval (the first-review case),
 * since four identical numbers carry no information. Keyboard handling (1-4)
 * is the consumer's responsibility; `showKeys` renders the hint and announces
 * it through `aria-keyshortcuts`.
 */
const RatingBar = forwardRef<HTMLDivElement, RatingBarProps>(
  (
    {
      label,
      intervals,
      labels,
      formatInterval,
      onRate,
      disabled = false,
      showIntervals = true,
      showKeys = false,
      className,
      ...rest
    },
    ref
  ) => {
    const hasDistinctIntervals =
      new Set(RATING_ORDER.map((key) => intervals[key])).size > 1;
    return (
      <div
        ref={ref}
        {...rest}
        role="group"
        aria-label={label}
        className={cn('flex w-full gap-2', className)}
      >
        {RATING_ORDER.map((key, index) => {
          const caption =
            showIntervals && hasDistinctIntervals
              ? formatInterval(intervals[key])
              : null;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-label={caption ? `${labels[key]}, ${caption}` : labels[key]}
              aria-keyshortcuts={showKeys ? String(index + 1) : undefined}
              onClick={() => onRate(RATING_QUALITY[key])}
              className={ratingButton({ rating: key })}
            >
              <span className="flex items-center gap-1.5">
                {showKeys ? <Kbd>{index + 1}</Kbd> : null}
                {labels[key]}
              </span>
              {caption ? (
                <span className="text-2xs tabular-nums">{caption}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }
);
RatingBar.displayName = 'RatingBar';

export { RatingBar };
