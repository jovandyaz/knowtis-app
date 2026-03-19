import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TFunction } from 'i18next';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { useReviewCard } from '@knowtis/data-access-artifacts';
import { Badge, Button } from '@knowtis/design-system';
import {
  SM2_QUALITY,
  type FlashcardArtifact,
  type FlashcardDifficulty,
  type SM2Quality,
} from '@knowtis/shared-types';

interface FlashcardStudyProps {
  artifact: FlashcardArtifact;
}

const DIFFICULTY_COLORS: Record<FlashcardDifficulty, string> = {
  easy: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  hard: 'bg-red-500/10 text-red-600 border-red-500/20',
};

function getDifficultyLabel(
  difficulty: FlashcardDifficulty,
  t: TFunction<'notes'>
): string {
  const labels: Record<FlashcardDifficulty, string> = {
    easy: t('ai.artifacts.flashcards.difficulty.easy'),
    medium: t('ai.artifacts.flashcards.difficulty.medium'),
    hard: t('ai.artifacts.flashcards.difficulty.hard'),
  };
  return labels[difficulty];
}

interface QualityButton {
  quality: SM2Quality;
  label: string;
  variant: 'destructive' | 'outline' | 'default';
}

function getQualityButtons(t: TFunction<'notes'>): QualityButton[] {
  return [
    {
      quality: SM2_QUALITY.AGAIN,
      label: t('ai.artifacts.flashcards.quality.again'),
      variant: 'destructive',
    },
    {
      quality: SM2_QUALITY.HARD,
      label: t('ai.artifacts.flashcards.quality.hard'),
      variant: 'outline',
    },
    {
      quality: SM2_QUALITY.GOOD,
      label: t('ai.artifacts.flashcards.quality.good'),
      variant: 'outline',
    },
    {
      quality: SM2_QUALITY.EASY,
      label: t('ai.artifacts.flashcards.quality.easy'),
      variant: 'default',
    },
  ];
}

export function FlashcardStudy({ artifact }: FlashcardStudyProps) {
  const { t } = useTranslation('notes');
  const content = artifact.content;
  const reviewCard = useReviewCard(artifact.id);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const totalCards = content.cards.length;
  const currentCard = content.cards[currentIndex];
  const qualityButtons = getQualityButtons(t);

  const handleFlip = useCallback(() => {
    setFlipped((prev) => !prev);
  }, []);

  const handleRate = useCallback(
    (quality: number) => {
      reviewCard.mutate(
        { cardIndex: currentIndex, quality },
        {
          onSuccess: () => {
            setReviewedCount((prev) => prev + 1);
            setFlipped(false);

            if (currentIndex < totalCards - 1) {
              setCurrentIndex((prev) => prev + 1);
            }
          },
          onError: () => {
            toast.error(t('ai.artifacts.flashcards.reviewError'));
          },
        }
      );
    },
    [currentIndex, totalCards, reviewCard, t]
  );

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setFlipped(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex((prev) => prev + 1);
      setFlipped(false);
    }
  }, [currentIndex, totalCards]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setFlipped(false);
    setReviewedCount(0);
  }, []);

  const progressPercent =
    totalCards > 0 ? (reviewedCount / totalCards) * 100 : 0;

  const isComplete = reviewedCount >= totalCards;

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 min-w-0">
        <div className="h-2 w-full rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary w-full" />
        </div>
        <p className="text-lg font-semibold text-foreground">
          {t('ai.artifacts.flashcards.complete')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('ai.artifacts.flashcards.reviewedAll', { total: totalCards })}
        </p>
        <Button variant="outline" onClick={handleRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('ai.artifacts.flashcards.restart')}
        </Button>
      </div>
    );
  }

  if (!currentCard) {
    return null;
  }

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('ai.artifacts.flashcards.cardOf', {
              current: currentIndex + 1,
              total: totalCards,
            })}
          </span>
          <Button variant="ghost" size="icon" onClick={handleRestart}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Flashcard */}
      <div
        className="perspective-[1000px] cursor-pointer"
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleFlip();
          }
        }}
        aria-label={
          flipped
            ? t('ai.artifacts.flashcards.showFront')
            : t('ai.artifacts.flashcards.showBack')
        }
      >
        <div
          className={`relative h-64 w-full transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col rounded-xl border border-border bg-card p-6 [backface-visibility:hidden]">
            <Badge
              className={`mb-3 self-center shrink-0 ${DIFFICULTY_COLORS[currentCard.difficulty] ?? ''}`}
            >
              {getDifficultyLabel(currentCard.difficulty, t)}
            </Badge>
            <div className="flex-1 overflow-y-auto min-h-0">
              <p className="text-center text-sm text-foreground">
                {currentCard.front}
              </p>
            </div>
            {!flipped && (
              <p className="mt-2 text-center text-xs text-muted-foreground shrink-0">
                {t('ai.artifacts.flashcards.clickToFlip')}
              </p>
            )}
          </div>

          {/* Back */}
          <div className="absolute inset-0 flex flex-col rounded-xl border border-border bg-card p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center">
              <p className="text-center text-sm text-foreground">
                {currentCard.back}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rating buttons (when flipped) or show answer */}
      {flipped ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {qualityButtons.map(({ quality, label, variant }) => (
            <Button
              key={quality}
              variant={variant}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRate(quality);
              }}
              disabled={reviewCard.isPending}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex justify-center">
          <Button variant="default" size="sm" onClick={handleFlip}>
            {t('ai.artifacts.flashcards.showAnswer')}
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('ai.artifacts.flashcards.prev')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={currentIndex === totalCards - 1}
        >
          {t('ai.artifacts.flashcards.next')}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
