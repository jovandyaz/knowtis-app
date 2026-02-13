import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

import { AlertCircle } from 'lucide-react';

import { Button, Card } from '@knowtis/design-system';
import { logger } from '@knowtis/shared-util';

interface EditorErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="flex justify-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Editor Error
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Something went wrong with the collaborative editor. This could be due
          to a synchronization issue or a temporary problem.
        </p>
        {error && (
          <details className="text-xs text-left bg-muted/50 p-3 rounded">
            <summary className="cursor-pointer font-medium mb-2">
              Error Details
            </summary>
            <code className="text-destructive break-all">{error.message}</code>
          </details>
        )}
      </div>
      <div className="flex gap-2 justify-center">
        <Button onClick={resetErrorBoundary} variant="default">
          Try Again
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload Page
        </Button>
      </div>
    </Card>
  );
}

function handleError(error: Error, _info: React.ErrorInfo) {
  logger.error('Editor Error Boundary caught an error', {
    error,
    context: 'EditorErrorBoundary',
  });
}

export function EditorErrorBoundary({
  children,
  onReset,
}: EditorErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      {...(onReset ? { onReset } : {})}
    >
      {children}
    </ErrorBoundary>
  );
}
