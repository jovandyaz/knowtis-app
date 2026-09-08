import { useTranslation } from 'react-i18next';

import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useMotionPreset,
} from '@knowtis/design-system';

interface FlashcardNavProps {
  wrongCount: number;
  correctCount: number;
  canGoPrev: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
}

function AnimatedCounter({ count }: { count: number }) {
  const preset = useMotionPreset();
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={count}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={preset.fade}
        className="text-sm font-semibold tabular-nums"
      >
        {count}
      </motion.span>
    </AnimatePresence>
  );
}

export function FlashcardNav({
  wrongCount,
  correctCount,
  canGoPrev,
  onNavigatePrev,
  onNavigateNext,
}: FlashcardNavProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="flex items-center justify-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onNavigatePrev}
            disabled={!canGoPrev}
            aria-label={t('ai.artifacts.flashcards.prev')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.prev')}</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-1.5 rounded-full bg-learn-incorrect/15 px-3 py-1.5 text-learn-incorrect-text">
        <span className="sr-only">{t('ai.artifacts.flashcards.wrong')}</span>
        <X aria-hidden="true" className="h-4 w-4" />
        <AnimatedCounter count={wrongCount} />
      </div>

      <div className="flex items-center gap-1.5 rounded-full bg-learn-correct/15 px-3 py-1.5 text-learn-correct-text">
        <span className="sr-only">{t('ai.artifacts.flashcards.correct')}</span>
        <AnimatedCounter count={correctCount} />
        <Check aria-hidden="true" className="h-4 w-4" />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onNavigateNext}
            aria-label={t('ai.artifacts.flashcards.next')}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.next')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
