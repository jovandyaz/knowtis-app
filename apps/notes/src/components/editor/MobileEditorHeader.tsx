import { useTranslation } from 'react-i18next';

import { FloatingActionButton } from '@/components/layout/FloatingActionButton';
import { NoteActionsMenu } from '@/components/notes/NoteActionsMenu';
import { canPerformNoteAction } from '@/lib';
import { ArrowLeft, Share2 } from 'lucide-react';

import { Button } from '@knowtis/design-system';
import type { NoteAccessLevel } from '@knowtis/shared-types';

const FLOATING_TRIGGER_CLASSES =
  'h-10 w-10 rounded-full bg-(--background)/80 shadow-sm backdrop-blur-md';

interface MobileEditorHeaderProps {
  noteId: string;
  noteTitle: string;
  accessLevel: NoteAccessLevel;
  editorsCanShare: boolean;
  onShareClick: () => void;
  onBack: () => void;
}

export function MobileEditorHeader({
  noteId,
  noteTitle,
  accessLevel,
  editorsCanShare,
  onShareClick,
  onBack,
}: MobileEditorHeaderProps) {
  const { t } = useTranslation('notes');

  const canShare = canPerformNoteAction(accessLevel, 'share', {
    editorsCanShare,
  });
  const canDelete = canPerformNoteAction(accessLevel, 'delete');

  return (
    <>
      <FloatingActionButton
        icon={ArrowLeft}
        position="left"
        onClick={onBack}
        aria-label={t('editor.back')}
      />

      {(canShare || canDelete) && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 md:hidden">
          {canShare && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={FLOATING_TRIGGER_CLASSES}
              onClick={onShareClick}
              aria-label={t('editor.share')}
            >
              <Share2 className="h-5 w-5" />
            </Button>
          )}
          {canDelete && (
            <NoteActionsMenu
              noteId={noteId}
              noteTitle={noteTitle}
              triggerVariant="outline"
              triggerClassName={FLOATING_TRIGGER_CLASSES}
            />
          )}
        </div>
      )}

      <div className="h-14 md:hidden" />
    </>
  );
}
