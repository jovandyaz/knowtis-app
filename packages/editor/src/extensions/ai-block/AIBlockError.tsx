import { useTranslation } from 'react-i18next';

import { RotateCcw, X } from 'lucide-react';

import { Button } from '@knowtis/design-system';

interface AIBlockErrorProps {
  errorMessage: string;
  onRetry: () => void;
  onDiscard: () => void;
}

export function AIBlockError({
  errorMessage,
  onRetry,
  onDiscard,
}: AIBlockErrorProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-destructive">{errorMessage}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="mr-1 h-3 w-3" />
          {t('ai.aiBlock.retry')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <X className="mr-1 h-3 w-3" />
          {t('ai.aiBlock.discard')}
        </Button>
      </div>
    </div>
  );
}
