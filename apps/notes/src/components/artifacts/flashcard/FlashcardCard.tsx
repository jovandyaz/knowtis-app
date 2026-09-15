import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, FlipCard } from '@knowtis/design-system';
import type { FlashcardDifficulty } from '@knowtis/shared-types';

interface FlashcardCardProps {
  ref?: Ref<HTMLButtonElement>;
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  flipped: boolean;
  onFlip: () => void;
  /** `aria-keyshortcuts` value for the flip control; only pass keys the caller answers. */
  keyShortcuts?: string | undefined;
}

const DIFFICULTY_CLASS: Record<FlashcardDifficulty, string> = {
  easy: 'border-learn-difficulty-easy/20 bg-learn-difficulty-easy/10 text-learn-difficulty-easy-text',
  medium:
    'border-learn-difficulty-medium/20 bg-learn-difficulty-medium/10 text-learn-difficulty-medium-text',
  hard: 'border-learn-difficulty-hard/20 bg-learn-difficulty-hard/10 text-learn-difficulty-hard-text',
};

const DIFFICULTY_KEYS = {
  easy: 'ai.artifacts.flashcards.difficulty.easy',
  medium: 'ai.artifacts.flashcards.difficulty.medium',
  hard: 'ai.artifacts.flashcards.difficulty.hard',
} as const;

export function FlashcardCard({
  ref,
  front,
  back,
  difficulty,
  flipped,
  onFlip,
  keyShortcuts,
}: FlashcardCardProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="flex flex-col items-center gap-3">
      <Badge variant="outline" className={DIFFICULTY_CLASS[difficulty]}>
        {t(DIFFICULTY_KEYS[difficulty])}
      </Badge>

      <FlipCard
        ref={ref}
        className="min-h-72 w-full"
        flipped={flipped}
        onFlip={onFlip}
        aria-keyshortcuts={keyShortcuts}
        frontHint={t('ai.artifacts.flashcards.showBack')}
        backHint={t('ai.artifacts.flashcards.showFront')}
        front={
          <span className="text-center text-xl leading-relaxed font-semibold lg:text-2xl">
            {front}
          </span>
        }
        back={
          <span className="text-center text-xl leading-relaxed lg:text-2xl">
            {back}
          </span>
        }
      />
    </div>
  );
}
