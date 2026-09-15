import { useTranslation } from 'react-i18next';

import { Button } from '@knowtis/design-system';
import type { RestartFilter, StudySessionResult } from '@knowtis/shared-types';

import { StudySummary } from '../focus/StudySummary';
import { toCardSegments } from './card-segments';
import { MissedCardsList } from './MissedCardsList';
import { PracticeAgainButton } from './PracticeAgainButton';

interface FlashcardSummaryProps {
  result: StudySessionResult;
  onRestart: (filter: RestartFilter) => void;
  onBackToNote?: (() => void) | undefined;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function FlashcardSummary({
  result,
  onRestart,
  onBackToNote,
}: FlashcardSummaryProps) {
  const { t } = useTranslation('notes');
  const seconds = Math.floor(result.durationMs / MS_PER_SECOND);
  const duration = t('ai.artifacts.flashcards.summary.timeSpent', {
    minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
    seconds: String(seconds % SECONDS_PER_MINUTE).padStart(2, '0'),
  });
  const segments = toCardSegments(
    result.cardResults.map((card) => card.status),
    -1,
    true
  );
  const celebrate =
    result.total > 0 && result.correct === result.total && result.skipped === 0;

  return (
    <StudySummary
      headline={t('ai.artifacts.flashcards.summary.headline', {
        correct: result.correct,
        total: result.total,
      })}
      duration={duration}
      segments={segments}
      legend={[
        {
          state: 'correct',
          label: t('ai.artifacts.flashcards.summary.gotIt'),
          count: result.correct,
        },
        {
          state: 'wrong',
          label: t('ai.artifacts.flashcards.summary.missedIt'),
          count: result.wrong,
        },
        {
          state: 'skipped',
          label: t('ai.artifacts.flashcards.summary.skipped'),
          count: result.skipped,
        },
      ]}
      celebrate={celebrate}
      revisit={
        result.wrong > 0 ? (
          <MissedCardsList cards={result.cardResults} />
        ) : undefined
      }
      primaryAction={
        <PracticeAgainButton
          hasMissedCards={result.wrong > 0}
          hasSkippedCards={result.skipped > 0}
          missedCount={result.wrong}
          onRestart={onRestart}
        />
      }
      secondaryAction={
        onBackToNote ? (
          <Button variant="ghost" className="min-h-12" onClick={onBackToNote}>
            {t('ai.artifacts.focus.backToNote')}
          </Button>
        ) : undefined
      }
    />
  );
}
