import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../utils/cn';

/**
 * Pulsing placeholder block for loading states.
 */
const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('animate-pulse rounded-md bg-(--muted)', className)}
      {...props}
    />
  )
);
Skeleton.displayName = 'Skeleton';

export { Skeleton };
