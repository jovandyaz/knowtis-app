import { forwardRef, type HTMLAttributes } from 'react';

import type { BucketFilter } from '@knowtis/shared-types';

import { cn } from '../utils/cn';

/** Every dot the organization surfaces draw: the PARA buckets, the inbox, and "no bucket". */
export type BucketDotTone = BucketFilter | 'neutral';

const DOT_CLASS: Record<BucketDotTone, string> = {
  neutral: 'rounded-full bg-(--muted-foreground)',
  inbox:
    'rounded-[2px] border-[1.5px] border-dashed border-(--muted-foreground)',
  projects: 'rounded-full bg-bucket-projects',
  areas: 'rounded-full bg-bucket-areas',
  resources: 'rounded-full bg-bucket-resources',
  archive: 'rounded-full border-[1.5px] border-bucket-archive',
};

export interface BucketDotProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children'
> {
  bucket: BucketDotTone;
}

const BucketDot = forwardRef<HTMLSpanElement, BucketDotProps>(
  ({ bucket, className, ...rest }, ref) => (
    <span
      ref={ref}
      {...rest}
      aria-hidden="true"
      className={cn(
        'inline-block size-(--size-bucket-dot) shrink-0',
        DOT_CLASS[bucket],
        className
      )}
    />
  )
);
BucketDot.displayName = 'BucketDot';

export { BucketDot };
