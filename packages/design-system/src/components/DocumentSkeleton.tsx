import { forwardRef, useId, type HTMLAttributes } from 'react';

import { cn } from '../utils/cn';
import { Skeleton } from './Skeleton';

const LINE_WIDTHS = [
  'w-full',
  'w-11/12',
  'w-4/5',
  'w-full',
  'w-2/3',
  'w-3/4',
] as const;

const DEFAULT_LINES = 6;

export interface DocumentSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  lines?: number;
  showTitle?: boolean;
}

export const DocumentSkeleton = forwardRef<
  HTMLDivElement,
  DocumentSkeletonProps
>(
  (
    { className, label, lines = DEFAULT_LINES, showTitle = true, ...props },
    ref
  ) => {
    const labelId = useId();

    return (
      <div
        ref={ref}
        role="status"
        aria-labelledby={labelId}
        className={className}
        {...props}
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        {showTitle && (
          <Skeleton aria-hidden="true" className="mb-5 h-7 w-2/3" />
        )}
        <div aria-hidden="true" className="space-y-3">
          {Array.from({ length: lines }, (_, index) => (
            <Skeleton
              key={index}
              className={cn('h-4', LINE_WIDTHS[index % LINE_WIDTHS.length])}
            />
          ))}
        </div>
      </div>
    );
  }
);
DocumentSkeleton.displayName = 'DocumentSkeleton';
