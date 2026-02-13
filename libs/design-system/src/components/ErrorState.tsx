import { forwardRef, type HTMLAttributes } from 'react';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { cn } from '../utils';
import { Button } from './Button';

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  fullHeight?: boolean;
}

const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      title = 'Something went wrong',
      message = 'An unexpected error occurred. Please try again.',
      onRetry,
      retryLabel = 'Try again',
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
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
        <div className="rounded-full bg-(--destructive)/10 p-3">
          <AlertCircle className="h-8 w-8 text-(--destructive)" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-(--foreground)">{title}</h3>
          <p className="text-sm text-(--muted-foreground)">{message}</p>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  )
);
ErrorState.displayName = 'ErrorState';

export { ErrorState };
