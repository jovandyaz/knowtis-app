import { forwardRef } from 'react';

export interface MutationErrorAlertProps {
  error: Error | null;
  isError: boolean;
  rateLimited?: boolean;
  hasFieldErrors?: boolean;
  fallbackMessage: string;
}

const MutationErrorAlert = forwardRef<HTMLDivElement, MutationErrorAlertProps>(
  (
    {
      error,
      isError,
      rateLimited = false,
      hasFieldErrors = false,
      fallbackMessage,
    },
    ref
  ) => {
    if (!isError || rateLimited || hasFieldErrors) {
      return null;
    }

    return (
      <div
        ref={ref}
        role="alert"
        aria-live="polite"
        className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
      >
        {error instanceof Error ? error.message : fallbackMessage}
      </div>
    );
  }
);
MutationErrorAlert.displayName = 'MutationErrorAlert';

export { MutationErrorAlert };
