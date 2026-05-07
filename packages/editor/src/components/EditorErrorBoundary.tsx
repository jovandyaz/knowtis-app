import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import { AlertCircle } from 'lucide-react';

import { Button, Card } from '@knowtis/design-system';
import { logger } from '@knowtis/shared-util';

interface EditorErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('errors');

  return (
    <Card className="p-8 text-center space-y-4">
      <div className="flex justify-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t('boundary.editorTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('boundary.editorDescription')}
        </p>
        {error && (
          <details className="text-xs text-left bg-muted/50 p-3 rounded">
            <summary className="cursor-pointer font-medium mb-2">
              {t('boundary.errorDetails')}
            </summary>
            <code className="text-destructive break-all">{error.message}</code>
          </details>
        )}
      </div>
      <div className="flex gap-2 justify-center">
        <Button onClick={resetErrorBoundary} variant="default">
          {t('boundary.tryAgain')}
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          {t('boundary.reloadPage')}
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
