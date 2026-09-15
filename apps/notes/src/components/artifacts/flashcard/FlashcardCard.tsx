import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { motion } from 'motion/react';

import {
  FlipCard,
  OutcomeStamp,
  useMotionPreset,
  type OutcomeStampVerdict,
} from '@knowtis/design-system';
import type { FlashcardDifficulty } from '@knowtis/shared-types';

import { getCardTextClass } from './card-text-class';

interface FlashcardCardProps {
  ref?: Ref<HTMLButtonElement>;
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  flipped: boolean;
  onFlip: () => void;
  /** `aria-keyshortcuts` value for the flip control; only pass keys the caller answers. */
  keyShortcuts?: string | undefined;
  verdict?: OutcomeStampVerdict;
  showPile: boolean;
  index: number;
  total: number;
}

const STAMP_PRINT_SCALE = 1.3;
const EYEBROW_CLASS =
  'font-mono text-2xs font-medium leading-4 uppercase tracking-widest text-(--muted-foreground)';
const VERDICT_LABEL_KEY = {
  correct: 'ai.artifacts.flashcards.summary.gotIt',
  wrong: 'ai.artifacts.flashcards.summary.missedIt',
  skipped: 'ai.artifacts.flashcards.summary.skipped',
} as const satisfies Record<OutcomeStampVerdict, string>;

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
  verdict,
  showPile,
  index,
  total,
}: FlashcardCardProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();
  const [stamp, setStamp] = useState({ verdict, print: false });
  if (stamp.verdict !== verdict) {
    setStamp({
      verdict,
      print: stamp.verdict === undefined && verdict !== undefined,
    });
  }

  const outcome = verdict ? (
    <motion.span
      data-study-stamp
      className="pointer-events-none absolute inset-0 origin-top-right"
      initial={
        stamp.print && !preset.reduced ? { scale: STAMP_PRINT_SCALE } : false
      }
      animate={{ scale: 1 }}
      transition={preset.stamp}
    >
      <OutcomeStamp verdict={verdict} label={t(VERDICT_LABEL_KEY[verdict])} />
    </motion.span>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3 font-mono text-2xs font-medium leading-4 uppercase tracking-wide tabular-nums text-(--muted-foreground) sm:text-xs">
        <span className="shrink-0">
          {t('ai.artifacts.focus.cardMeta', {
            current: String(index + 1).padStart(2, '0'),
            total: String(total).padStart(2, '0'),
          })}
        </span>
        <span className="min-w-0 truncate text-right">
          {t(DIFFICULTY_KEYS[difficulty])}
        </span>
      </div>
      <div className="relative isolate w-full">
        {showPile && (
          <span
            data-card-pile
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 translate-x-1 translate-y-1 rounded-lg border border-(--border) bg-(--muted) opacity-70 dark:bg-(--card) dark:opacity-40"
          />
        )}
        <FlipCard
          ref={ref}
          className="min-h-72 w-full [&_[data-face-side]]:shadow-none [&_[data-face-side]:hover]:border-(--border)"
          flipped={flipped}
          onFlip={onFlip}
          aria-label={flipped ? back : front}
          aria-keyshortcuts={keyShortcuts}
          frontHint={t('ai.artifacts.flashcards.showBack')}
          backHint={t('ai.artifacts.flashcards.showFront')}
          front={
            <span className="flex w-full flex-col self-stretch">
              <span className={`${EYEBROW_CLASS} pr-10`}>
                {t('ai.artifacts.focus.side.question')}
              </span>
              <span
                className={`my-auto py-6 font-normal whitespace-pre-wrap wrap-anywhere ${getCardTextClass(front)}`}
              >
                {front}
              </span>
              {!flipped && outcome}
            </span>
          }
          back={
            <span className="flex w-full flex-col self-stretch">
              <span className={`${EYEBROW_CLASS} pr-10`}>
                {t('ai.artifacts.focus.side.answer')}
              </span>
              <span
                className={`my-auto py-6 font-normal whitespace-pre-wrap wrap-anywhere ${getCardTextClass(back)}`}
              >
                {back}
              </span>
              {flipped && outcome}
            </span>
          }
        />
      </div>
    </div>
  );
}
