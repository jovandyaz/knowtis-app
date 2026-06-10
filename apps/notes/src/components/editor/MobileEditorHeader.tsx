import { useTranslation } from 'react-i18next';

import { FloatingActionButton } from '@/components/layout/FloatingActionButton';
import { canPerformNoteAction } from '@/lib';
import { ArrowLeft, Share2 } from 'lucide-react';

import type { NoteAccessLevel } from '@knowtis/shared-types';

interface MobileEditorHeaderProps {
  accessLevel: NoteAccessLevel;
  editorsCanShare: boolean;
  onShareClick: () => void;
  onBack: () => void;
}

export function MobileEditorHeader({
  accessLevel,
  editorsCanShare,
  onShareClick,
  onBack,
}: MobileEditorHeaderProps) {
  const { t } = useTranslation('notes');

  return (
    <>
      <FloatingActionButton
        icon={ArrowLeft}
        position="left"
        onClick={onBack}
        aria-label={t('editor.back')}
      />
      {canPerformNoteAction(accessLevel, 'share', { editorsCanShare }) && (
        <FloatingActionButton
          icon={Share2}
          position="right"
          onClick={onShareClick}
          aria-label={t('editor.share')}
        />
      )}

      <div className="h-14 md:hidden" />
    </>
  );
}
