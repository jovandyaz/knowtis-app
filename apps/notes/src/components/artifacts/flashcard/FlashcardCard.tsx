import { useTranslation } from 'react-i18next';

import { AnimatePresence, motion } from 'motion/react';

import { Badge } from '@knowtis/design-system';
import type { FlashcardDifficulty } from '@knowtis/shared-types';

interface FlashcardCardProps {
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  flipped: boolean;
  cardIndex: number;
  onFlip: () => void;
}

const DIFFICULTY_COLORS: Record<FlashcardDifficulty, string> = {
  easy: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  hard: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const DIFFICULTY_KEYS = {
  easy: 'ai.artifacts.flashcards.difficulty.easy',
  medium: 'ai.artifacts.flashcards.difficulty.medium',
  hard: 'ai.artifacts.flashcards.difficulty.hard',
} as const;

export function FlashcardCard({
  front,
  back,
  difficulty,
  flipped,
  cardIndex,
  onFlip,
}: FlashcardCardProps) {
  const { t } = useTranslation('notes');

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={cardIndex}
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="perspective-[1000px] cursor-pointer"
        onClick={onFlip}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFlip();
          }
        }}
        aria-label={
          flipped
            ? t('ai.artifacts.flashcards.showFront')
            : t('ai.artifacts.flashcards.showBack')
        }
      >
        <motion.div
          className="relative min-h-72 w-full transform-3d"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 backface-hidden">
            <Badge
              variant="outline"
              className={`mb-3 self-center shrink-0 ${DIFFICULTY_COLORS[difficulty]}`}
            >
              {t(DIFFICULTY_KEYS[difficulty])}
            </Badge>
            <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center">
              <p className="text-center text-xl font-semibold text-foreground leading-relaxed">
                {front}
              </p>
            </div>
            {!flipped && (
              <span className="mt-4 self-center text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer">
                {t('ai.artifacts.flashcards.showAnswer')}
              </span>
            )}
          </div>

          {/* Back */}
          <div className="absolute inset-0 flex flex-col rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 backface-hidden [transform:rotateY(180deg)]">
            <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center">
              <p className="text-center text-sm text-foreground leading-relaxed">
                {back}
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
