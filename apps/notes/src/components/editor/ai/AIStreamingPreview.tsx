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
        'rounded-xl border border-primary/20 border-t-2 border-t-primary/30 bg-popover/95 shadow-[0_0_30px_-8px] shadow-primary/25 backdrop-blur-xl',
        'animate-in fade-in slide-in-from-top-2 duration-200'
      )}
      style={width ? { width: `${width}px` } : { width: 420, maxWidth: '90vw' }}
    >
      {/* Streaming / Done text preview */}
      {(status === 'streaming' || status === 'done') && (
        <div className="relative max-h-52 overflow-y-auto overflow-hidden px-4 pt-3 pb-2 text-sm leading-relaxed text-foreground">
          {status === 'streaming' && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-popover/80 via-transparent to-transparent" />
              <div className="animate-shimmer pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,currentColor_50%,transparent_100%)] opacity-4" />
            </>
          )}
          <p className="whitespace-pre-wrap leading-relaxed">
            {streamedText}
            {status === 'streaming' && (
              <span className="animate-blink ml-0.5 inline-block h-5 w-0.5 bg-primary" />
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

      {/* Action buttons — pill-shaped button group */}
      <div
        className={cn(
          'flex items-center gap-2 border-t border-border/30 px-2 py-1.5',
          status === 'streaming' && 'justify-between'
        )}
      >
        {status === 'streaming' && (
          <>
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground"
                onClick={cancelStream}
              >
                <X className="h-3.5 w-3.5" />
                {t('ai.preview.cancel')}
              </Button>
            </div>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </>
        )}

        {status === 'done' && streamedText && (
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
              <Button
                variant="default"
                size="sm"
                className="h-6 gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:shadow-[0_0_12px_-2px] hover:shadow-primary/40"
                onClick={() => onReplace(streamedText)}
              >
                <Check className="h-3.5 w-3.5" />
                {t('ai.preview.replace')}
              </Button>
              <div className="h-4 w-px bg-border/40" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded-full px-3 py-1 text-xs transition-all duration-150 hover:bg-accent"
                onClick={() => onInsertBelow(streamedText)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {t('ai.preview.insertBelow')}
              </Button>
              <div className="h-4 w-px bg-border/40" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded-full px-3 py-1 text-xs transition-all duration-150 hover:bg-accent"
                onClick={retry}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('ai.preview.regenerate')}
              </Button>
            </div>
            <div className="flex items-center rounded-full bg-muted/50 p-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground"
                onClick={onDiscard}
              >
                <X className="h-3.5 w-3.5" />
                {t('ai.preview.discard')}
              </Button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 rounded-full px-3 py-1 text-xs transition-all duration-150 hover:bg-accent"
              onClick={retry}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('ai.preview.retry')}
            </Button>
            <div className="h-4 w-px bg-border/40" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground"
              onClick={onDiscard}
            >
              <X className="h-3.5 w-3.5" />
              {t('ai.preview.dismiss')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
