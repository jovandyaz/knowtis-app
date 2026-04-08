import { useTranslation } from 'react-i18next';

import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import { SM2_QUALITY, type SM2Quality } from '@knowtis/shared-types';

interface FlashcardControlsProps {
  isAdvancedMode: boolean;
  isFlipped: boolean;
  readOnly?: boolean | undefined;
  onWrong: () => void;
  onCorrect: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onRateAdvanced: (quality: SM2Quality) => void;
  wrongCount: number;
  correctCount: number;
  disabled: boolean;
  canGoPrev: boolean;
}

const ADVANCED_BUTTONS = [
  {
    quality: SM2_QUALITY.AGAIN,
    labelKey: 'ai.artifacts.flashcards.quality.again' as const,
    variant: 'destructive' as const,
  },
  {
    quality: SM2_QUALITY.HARD,
    labelKey: 'ai.artifacts.flashcards.quality.hard' as const,
    variant: 'outline' as const,
  },
  {
    quality: SM2_QUALITY.GOOD,
    labelKey: 'ai.artifacts.flashcards.quality.good' as const,
    variant: 'outline' as const,
  },
  {
    quality: SM2_QUALITY.EASY,
    labelKey: 'ai.artifacts.flashcards.quality.easy' as const,
    variant: 'default' as const,
  },
] as const;

function AnimatedCounter({ count }: { count: number }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={count}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="text-sm font-semibold tabular-nums"
      >
        {count}
      </motion.span>
    </AnimatePresence>
  );
}

export function FlashcardControls({
  isAdvancedMode,
  isFlipped,
  readOnly,
  onWrong,
  onCorrect,
  onNavigatePrev,
  onNavigateNext,
  onRateAdvanced,
  wrongCount,
  correctCount,
  disabled,
  canGoPrev,
}: FlashcardControlsProps) {
  const { t } = useTranslation('notes');

  if (isFlipped && isAdvancedMode && !readOnly) {
    return (
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {ADVANCED_BUTTONS.map((btn) => (
          <motion.div key={btn.quality} whileTap={{ scale: 0.95 }}>
            <Button
              variant={btn.variant}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRateAdvanced(btn.quality);
              }}
              disabled={disabled}
            >
              {t(btn.labelKey)}
            </Button>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (isFlipped) {
    return (
      <motion.div
        className="flex items-center justify-center gap-4 pb-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button
            variant="destructive"
            className="rounded-full bg-destructive/15 px-6 py-2.5 text-destructive ring-1 ring-destructive/25 hover:bg-destructive/25 hover:ring-destructive/40 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)]"
            onClick={(e) => {
              e.stopPropagation();
              onWrong();
            }}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
            {t('ai.artifacts.flashcards.wrong')}
          </Button>
        </motion.div>

        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button
            variant="ghost"
            className="rounded-full bg-green-500/15 px-6 py-2.5 text-green-500 ring-1 ring-green-500/25 hover:bg-green-500/25 hover:ring-green-500/40 hover:shadow-[0_0_12px_rgba(34,197,94,0.15)]"
            onClick={(e) => {
              e.stopPropagation();
              onCorrect();
            }}
            disabled={disabled}
          >
            <Check className="h-4 w-4" />
            {t('ai.artifacts.flashcards.correct')}
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Back arrow */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onNavigatePrev();
            }}
            disabled={!canGoPrev}
            aria-label={t('ai.artifacts.flashcards.prev')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.prev')}</TooltipContent>
      </Tooltip>

      {/* Wrong counter pill */}
      <motion.div
        className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5"
        whileTap={{ scale: 0.95 }}
      >
        <X className="h-4 w-4 text-destructive" />
        <AnimatedCounter count={wrongCount} />
      </motion.div>

      {/* Correct counter pill */}
      <motion.div
        className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1.5"
        whileTap={{ scale: 0.95 }}
      >
        <AnimatedCounter count={correctCount} />
        <Check className="h-4 w-4 text-green-500" />
      </motion.div>

      {/* Forward arrow */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateNext();
            }}
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
