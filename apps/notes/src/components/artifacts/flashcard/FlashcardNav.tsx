import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

interface FlashcardNavProps {
  canGoPrev: boolean;
  canGoNext: boolean;
  canSkip: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onSkip: () => void;
}

const ARROW_BUTTON_CLASS = 'h-12 w-12 rounded-full';

export function FlashcardNav({
  canGoPrev,
  canGoNext,
  canSkip,
  onNavigatePrev,
  onNavigateNext,
  onSkip,
}: FlashcardNavProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="grid w-full min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={ARROW_BUTTON_CLASS}
            onClick={onNavigatePrev}
            disabled={!canGoPrev}
            aria-label={t('ai.artifacts.flashcards.prev')}
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.prev')}</TooltipContent>
      </Tooltip>

      <Button
        variant="outline"
        className="min-h-12 min-w-0 justify-self-center rounded-full px-5 whitespace-nowrap"
        onClick={onSkip}
        disabled={!canSkip}
      >
        <SkipForward aria-hidden="true" className="h-4 w-4" />
        {t('ai.artifacts.flashcards.skipCard')}
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={ARROW_BUTTON_CLASS}
            onClick={onNavigateNext}
            disabled={!canGoNext}
            aria-label={t('ai.artifacts.flashcards.next')}
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.next')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
