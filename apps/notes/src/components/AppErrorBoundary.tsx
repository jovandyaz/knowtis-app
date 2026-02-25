import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import { AlertCircle } from 'lucide-react';

import { Button } from '@knowtis/design-system';
import { logger } from '@knowtis/shared-util';

function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('errors');

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-semibold text-foreground">
          {t('boundary.title')}
        </h1>
        <p className="text-muted-foreground">{t('boundary.description')}</p>
        {error && (
          <details className="text-xs text-left bg-muted/50 p-3 rounded">
            <summary className="cursor-pointer font-medium mb-2">
              {t('boundary.errorDetails')}
            </summary>
            <code className="text-destructive break-all">{error.message}</code>
          </details>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={resetErrorBoundary} variant="default">
            {t('boundary.tryAgain')}
          </Button>
          <Button onClick={() => window.location.reload()} variant="outline">
            {t('boundary.reloadPage')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function handleAppError(error: Error, _info: React.ErrorInfo) {
  logger.error('Unhandled React error', {
    error,
    context: 'AppErrorBoundary',
  });
}

interface AppErrorBoundaryProps {
  children: ReactNode;
}

export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={AppErrorFallback}
      onError={handleAppError}
    >
      {children}
    </ErrorBoundary>
  );
}
