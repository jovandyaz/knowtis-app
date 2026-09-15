import { useTranslation } from 'react-i18next';

import { MoreHorizontal, RotateCcw, Shuffle } from 'lucide-react';

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@knowtis/design-system';

interface FlashcardMenuProps {
  isAdvancedMode: boolean;
  onToggleAdvanced: () => void;
  onRestart: () => void;
  onShuffle: () => void;
  readOnly?: boolean | undefined;
  disabled?: boolean;
}

export function FlashcardMenu({
  isAdvancedMode,
  onToggleAdvanced,
  onRestart,
  onShuffle,
  readOnly,
  disabled,
}: FlashcardMenuProps) {
  const { t } = useTranslation('notes');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-12 w-12"
          aria-label={t('ai.artifacts.focus.options')}
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!readOnly && (
          <>
            <DropdownMenuCheckboxItem
              checked={isAdvancedMode}
              onCheckedChange={onToggleAdvanced}
            >
              {t('ai.artifacts.flashcards.advancedMode')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={onShuffle}>
          <Shuffle className="mr-2 h-4 w-4" />
          {t('ai.artifacts.flashcards.shuffle')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('ai.artifacts.flashcards.restart')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
