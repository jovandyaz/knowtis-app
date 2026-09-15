import { useTranslation } from 'react-i18next';

import { ChevronDown, Play } from 'lucide-react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import type { RestartFilter } from '@knowtis/shared-types';

interface PracticeAgainButtonProps {
  hasMissedCards: boolean;
  hasSkippedCards: boolean;
  missedCount: number;
  onRestart: (filter: RestartFilter) => void;
}

export function PracticeAgainButton({
  hasMissedCards,
  hasSkippedCards,
  missedCount,
  onRestart,
}: PracticeAgainButtonProps) {
  const { t } = useTranslation('notes');

  const hasFilterOptions = hasMissedCards || hasSkippedCards;

  if (!hasFilterOptions) {
    return (
      <Button
        className="h-auto min-h-12 w-full min-w-0 whitespace-normal py-3 text-center"
        onClick={() => onRestart('all')}
      >
        <Play className="h-4 w-4 shrink-0" />
        {t('ai.artifacts.flashcards.summary.practiceAgain')}
      </Button>
    );
  }

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Button
        className="h-auto min-h-12 min-w-0 whitespace-normal py-3 text-center"
        onClick={() => onRestart(hasMissedCards ? 'missed' : 'all')}
      >
        <Play className="h-4 w-4 shrink-0" />
        {hasMissedCards
          ? t('ai.artifacts.flashcards.summary.practiceMissed', {
              count: missedCount,
            })
          : t('ai.artifacts.flashcards.summary.practiceAgain')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-12 min-h-12 w-12 min-w-12 p-0"
            aria-label={t('ai.artifacts.flashcards.summary.practiceOptions')}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRestart('all')}>
            {t('ai.artifacts.flashcards.summary.allCards')}
          </DropdownMenuItem>
          {hasMissedCards && (
            <DropdownMenuItem onSelect={() => onRestart('missed')}>
              {t('ai.artifacts.flashcards.summary.onlyMissed')}
            </DropdownMenuItem>
          )}
          {hasSkippedCards && (
            <DropdownMenuItem onSelect={() => onRestart('skipped')}>
              {t('ai.artifacts.flashcards.summary.onlySkipped')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
