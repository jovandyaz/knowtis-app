import { forwardRef, type HTMLAttributes } from 'react';

import { Loader2 } from 'lucide-react';

import { cn } from '../utils';

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullHeight?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
} as const;

export const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(
  (
    {
      className,
      message = 'Loading...',
      size = 'md',
      fullHeight = true,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-center',
        fullHeight && 'min-h-[50vh]',
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-4">
        <Loader2
          className={cn('animate-spin text-(--primary)', sizeClasses[size])}
        />
        {message && (
          <p className="text-sm text-(--muted-foreground)">{message}</p>
        )}
      </div>
    </div>
  )
);
LoadingState.displayName = 'LoadingState';
