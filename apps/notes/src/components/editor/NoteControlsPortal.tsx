import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ShareDialog } from '@/components/notes/ShareDialog';
import { usePortalTarget } from '@/hooks/usePortalTarget';
import { ACCESS_BADGE_CONFIG, canPerformNoteAction } from '@/lib';
import { Share2 } from 'lucide-react';

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import { SaveStatusIndicator } from '@knowtis/editor';
import type {
  GeneralAccessLevel,
  NoteAccessLevel,
  PermissionLevel,
} from '@knowtis/shared-types';

const PORTAL_TARGET_ID = 'note-controls-portal';

export interface NoteControlsDetails {
  id: string;
  title: string;
  accessLevel: NoteAccessLevel;
  editorsCanShare: boolean;
  generalAccess: GeneralAccessLevel;
  generalAccessPermission: PermissionLevel;
  shareToken: string | null;
}

interface NoteControlsPortalProps {
  note: NoteControlsDetails;
  isSaving: boolean;
  hasSaved: boolean;
  shareDialogOpen: boolean;
  onShareDialogOpenChange: (open: boolean) => void;
}

export function NoteControlsPortal({
  note,
  isSaving,
  hasSaved,
  shareDialogOpen,
  onShareDialogOpenChange,
}: NoteControlsPortalProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const portalTarget = usePortalTarget(PORTAL_TARGET_ID);

  const badgeConfig = ACCESS_BADGE_CONFIG[note.accessLevel];
  const showBadge = note.accessLevel !== 'owner';
  const canEdit = canPerformNoteAction(note.accessLevel, 'update');
  const canShare = canPerformNoteAction(note.accessLevel, 'share', {
    editorsCanShare: note.editorsCanShare,
  });

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <>
      {showBadge && (
        <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
      )}

      {canEdit &&
        (isSaving ? (
          <SaveStatusIndicator
            status="saving"
            label={tCommon('states.saving')}
            className="text-xs text-(--muted-foreground)"
            transient
          />
        ) : hasSaved ? (
          <SaveStatusIndicator
            status="saved"
            label={tCommon('states.saved')}
            className="text-xs text-(--muted-foreground)"
            transient
          />
        ) : null)}

      {canShare && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-(--muted-foreground) hover:text-(--foreground)"
                onClick={() => onShareDialogOpenChange(true)}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              hidden={shareDialogOpen}
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              {t('editor.share')}
            </TooltipContent>
          </Tooltip>
          <ShareDialog
            open={shareDialogOpen}
            onOpenChange={(open) => {
              onShareDialogOpenChange(open);
              if (!open) {
                requestAnimationFrame(() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                });
              }
            }}
            noteId={note.id}
            noteTitle={note.title}
            generalAccess={note.generalAccess}
            generalAccessPermission={note.generalAccessPermission}
            shareToken={note.shareToken}
            editorsCanShare={note.editorsCanShare}
            accessLevel={note.accessLevel}
          />
        </>
      )}
    </>,
    portalTarget
  );
}
