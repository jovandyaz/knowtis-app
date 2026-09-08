import { forwardRef, type HTMLAttributes } from 'react';

import type { DeckChipTone } from '../constants/deck-chip';
import { cn } from '../utils';
import { badgeVariants } from './Badge';

const DOT_CLASS: Record<DeckChipTone, string> = {
  neutral: 'bg-(--muted-foreground)',
  projects: 'bg-bucket-projects',
  areas: 'bg-bucket-areas',
  resources: 'bg-bucket-resources',
  archive: 'border-[1.5px] border-bucket-archive',
};

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
      <span
        data-tone={tone}
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[tone])}
      />
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
