import type { HTMLAttributes } from 'react';

import { cn } from '../utils';

/**
 * Pulsing placeholder block for loading states.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-(--muted)', className)}
      {...props}
    />
  );
}
