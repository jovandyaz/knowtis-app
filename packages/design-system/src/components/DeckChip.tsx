import { forwardRef, type HTMLAttributes } from 'react';

import type { DeckChipTone } from '../constants/deck-chip';
import { cn } from '../utils/cn';
import { badgeVariants } from './Badge';
import { BucketDot } from './BucketDot';

export interface DeckChipProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children' | 'title'
> {
  /** Visible deck name, also emitted as the native tooltip when it truncates. */
  title: string;
  tone?: DeckChipTone;
  isNew?: boolean;
  newLabel: string;
}

const DeckChip = forwardRef<HTMLSpanElement, DeckChipProps>(
  (
    { title, tone = 'neutral', isNew = false, newLabel, className, ...rest },
    ref
  ) => (
    <span
      ref={ref}
      {...rest}
      className={cn(
        'inline-flex max-w-full items-center gap-2 text-xs text-(--muted-foreground)',
        className
      )}
    >
      <BucketDot bucket={tone} data-tone={tone} className="size-1.5" />
      <span className="truncate" title={title}>
        {title}
      </span>
      {isNew ? (
        <span className={badgeVariants({ variant: 'secondary' })}>
          {newLabel}
        </span>
      ) : null}
    </span>
  )
);
DeckChip.displayName = 'DeckChip';

export { DeckChip };
