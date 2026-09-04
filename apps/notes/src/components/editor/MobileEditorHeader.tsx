import { useTranslation } from 'react-i18next';

import { NoteActionsMenu } from '@/components/notes/NoteActionsMenu';
import { canPerformNoteAction } from '@/lib';
import { ArrowLeft, Share2 } from 'lucide-react';

import { Button } from '@knowtis/design-system';
import type { NoteAccessLevel } from '@knowtis/shared-types';

const FLOATING_TRIGGER_CLASSES =
  'pointer-events-auto h-10 w-10 rounded-full bg-(--background)/80 shadow-sm backdrop-blur-md';

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
    // Sticky inside the page scroller (not fixed to the viewport) so anything
    // the app layout stacks above the page, like the verify-email banner,
    // pushes these controls down instead of sliding underneath them.
    <div className="pointer-events-none sticky top-0 z-30 flex items-start justify-between pb-4 md:hidden">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={FLOATING_TRIGGER_CLASSES}
        onClick={onBack}
        aria-label={t('editor.back')}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {(canShare || canDelete) && (
        <div className="flex items-center gap-2">
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
    </div>
  );
}
