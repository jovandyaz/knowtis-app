export interface MutationErrorAlertProps {
  error: Error | null;
  isError: boolean;
  rateLimited?: boolean;
  hasFieldErrors?: boolean;
  fallbackMessage: string;
}

export function MutationErrorAlert({
  error,
  isError,
  rateLimited = false,
  hasFieldErrors = false,
  fallbackMessage,
}: MutationErrorAlertProps) {
  if (!isError || rateLimited || hasFieldErrors) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
    >
      {error instanceof Error ? error.message : fallbackMessage}
    </div>
  );
}
