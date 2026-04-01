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
  onRestart: (filter: RestartFilter) => void;
}

export function PracticeAgainButton({
  hasMissedCards,
  hasSkippedCards,
  onRestart,
}: PracticeAgainButtonProps) {
  const { t } = useTranslation('notes');

  const hasFilterOptions = hasMissedCards || hasSkippedCards;

  if (!hasFilterOptions) {
    return (
      <Button variant="outline" onClick={() => onRestart('all')}>
        <Play className="mr-2 h-4 w-4" />
        {t('ai.artifacts.flashcards.summary.practiceAgain')}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Play className="mr-2 h-4 w-4" />
          {t('ai.artifacts.flashcards.summary.practiceAgain')}
          <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
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
  );
}
