import { useTranslation } from 'react-i18next';

import { RotateCcw, Settings2, Shuffle } from 'lucide-react';

import {
  Button,
  cn,
  ProgressRing,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TOUCH_TARGET_CLASS,
} from '@knowtis/design-system';

interface FlashcardHeaderProps {
  current: number;
  total: number;
  reviewedCount: number;
  isAdvancedMode: boolean;
  onToggleAdvanced: () => void;
  onRestart: () => void;
  onShuffle: () => void;
  readOnly?: boolean | undefined;
}

export function FlashcardHeader({
  current,
  total,
  reviewedCount,
  isAdvancedMode,
  onToggleAdvanced,
  onRestart,
  onShuffle,
  readOnly,
}: FlashcardHeaderProps) {
  const { t } = useTranslation('notes');
  const position = t('ai.artifacts.flashcards.cardOf', {
    current: current + 1,
    total,
  });
  const reviewed = t('ai.artifacts.flashcards.reviewedOf', {
    reviewed: reviewedCount,
    total,
  });

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <ProgressRing value={reviewedCount} max={total} label={reviewed}>
          {reviewedCount}
        </ProgressRing>

        <span className="text-sm text-(--muted-foreground)">{position}</span>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-(--muted-foreground)" />
                <Switch
                  checked={isAdvancedMode}
                  onCheckedChange={onToggleAdvanced}
                  size="sm"
                  aria-label={t('ai.artifacts.flashcards.advancedMode')}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {t('ai.artifacts.flashcards.advancedMode')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onShuffle}
                className={cn(TOUCH_TARGET_CLASS, 'w-8')}
                aria-label={t('ai.artifacts.flashcards.shuffle')}
              >
                <Shuffle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t('ai.artifacts.flashcards.shuffle')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRestart}
                className="h-8 w-8"
                aria-label={t('ai.artifacts.flashcards.restart')}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t('ai.artifacts.flashcards.restart')}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
