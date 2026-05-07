import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';
import { Streamdown } from 'streamdown';

import { Button } from '@knowtis/design-system';

interface AIBlockStreamingProps {
  streamedText: string;
  onCancel: () => void;
}

export function AIBlockStreaming({
  streamedText,
  onCancel,
}: AIBlockStreamingProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">
            {t('ai.aiBlock.generating')}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('ai.aiBlock.cancel')}
        </Button>
      </div>
      {streamedText ? (
        <Streamdown isAnimating>{streamedText}</Streamdown>
      ) : (
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-primary/10" />
          <div className="h-4 w-full animate-pulse rounded bg-primary/10" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-primary/10" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-primary/10" />
        </div>
      )}
    </div>
  );
}
