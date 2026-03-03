import { useTranslation } from 'react-i18next';

import { useAIStore } from '@/stores/ai.store';
import {
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';

import { Button, cn } from '@knowtis/design-system';

interface AIStreamingPreviewProps {
  width?: number;
  onReplace: (text: string) => void;
  onInsertBelow: (text: string) => void;
  onDiscard: () => void;
}

export function AIStreamingPreview({
  width,
  onReplace,
  onInsertBelow,
  onDiscard,
}: AIStreamingPreviewProps) {
  const { t } = useTranslation('notes');
  const { status, streamedText, error, cancelStream, retry } = useAIStore();

  if (status === 'idle') {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card/95 shadow-xl backdrop-blur-lg',
        'animate-in fade-in slide-in-from-top-2 duration-200'
      )}
      style={width ? { width: `${width}px` } : { width: 420, maxWidth: '90vw' }}
    >
      {/* Streaming / Done text preview */}
      {(status === 'streaming' || status === 'done') && (
        <div className="max-h-52 overflow-y-auto px-4 pt-3 pb-2 text-sm text-foreground">
          <p className="whitespace-pre-wrap leading-relaxed">
            {streamedText}
            {status === 'streaming' && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
            )}
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="px-4 pt-3 pb-2 text-sm text-destructive">
          {error?.message ?? t('ai.errors.generic')}
        </div>
      )}

      {/* Action buttons — separated by a subtle divider */}
      <div
        className={cn(
          'flex items-center gap-1 border-t border-border/40 px-2 py-1.5',
          status === 'streaming' && 'justify-between'
        )}
      >
        {status === 'streaming' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={cancelStream}
            >
              <X className="h-3.5 w-3.5" />
              {t('ai.preview.cancel')}
            </Button>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </>
        )}

        {status === 'done' && streamedText && (
          <>
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => onReplace(streamedText)}
            >
              <Check className="h-3.5 w-3.5" />
              {t('ai.preview.replace')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => onInsertBelow(streamedText)}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {t('ai.preview.insertBelow')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={retry}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('ai.preview.regenerate')}
            </Button>
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={onDiscard}
              >
                <X className="h-3.5 w-3.5" />
                {t('ai.preview.discard')}
              </Button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={retry}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('ai.preview.retry')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onDiscard}
            >
              <X className="h-3.5 w-3.5" />
              {t('ai.preview.dismiss')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
