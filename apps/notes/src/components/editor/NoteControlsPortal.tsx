import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { NoteActionsMenu } from '@/components/notes/NoteActionsMenu';
import { ShareDialog } from '@/components/notes/ShareDialog';
import { usePortalTarget } from '@/hooks/usePortalTarget';
import { ACCESS_BADGE_CONFIG, canPerformNoteAction } from '@/lib';
import { Share2 } from 'lucide-react';

import {
  Badge,
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import { SaveStatusIndicator, type SaveStatus } from '@knowtis/editor';
import type {
  GeneralAccessLevel,
  NoteAccessLevel,
  PermissionLevel,
} from '@knowtis/shared-types';

import type { DocumentConnectionState } from './CollaborativeEditor.types';
import { DocumentConnectionStatus } from './DocumentConnectionStatus';

const PORTAL_TARGET_ID = 'note-controls-portal';
const HEADER_ACTION_CLASSES = 'h-8 w-8 shrink-0';

/** `idle` covers the note nobody has edited yet, which has nothing to report. */
export type NoteSaveState = SaveStatus | 'idle';

const SAVE_STATE_LABEL_KEYS = {
  pending: 'states.pendingChanges',
  saving: 'states.saving',
  saved: 'states.saved',
  error: 'states.saveFailed',
} as const satisfies Record<SaveStatus, string>;

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
  connectionState: DocumentConnectionState | null;
  saveState: NoteSaveState;
  shareDialogOpen: boolean;
  onShareDialogOpenChange: (open: boolean) => void;
}

export function NoteControlsPortal({
  note,
  connectionState,
  saveState,
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
  const canDelete = canPerformNoteAction(note.accessLevel, 'delete');
  const showConnection = connectionState !== null;
  const showSaveState = canEdit && saveState !== 'idle';

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <>
      {showBadge && (
        <Badge variant={badgeConfig.variant}>{t(badgeConfig.labelKey)}</Badge>
      )}

      {(showConnection || showSaveState) && (
        <div className="grid shrink-0 grid-flow-col auto-cols-max items-center gap-2 2xl:auto-cols-[minmax(--spacing(20),max-content)]">
          {showConnection && (
            <DocumentConnectionStatus state={connectionState} />
          )}
          {showSaveState && (
            <SaveStatusIndicator
              status={saveState}
              label={tCommon(SAVE_STATE_LABEL_KEYS[saveState])}
              className={cn(
                'text-xs',
                saveState === 'error'
                  ? 'text-(--destructive)'
                  : 'text-(--muted-foreground)'
              )}
              transient
            />
          )}
        </div>
      )}

      {canEdit && (
        // A live region only reaches AT reliably once it's already mounted and observed;
        // toggling aria-live on the same commit that inserts the failure text is not dependable.
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={t('editor.saveStatus')}
          className="sr-only"
        >
          {saveState === 'error' ? tCommon(SAVE_STATE_LABEL_KEYS.error) : ''}
        </div>
      )}

      {canShare && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('editor.share')}
                className={cn(
                  HEADER_ACTION_CLASSES,
                  'text-(--muted-foreground) hover:text-(--foreground)'
                )}
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
            onOpenChange={onShareDialogOpenChange}
            noteId={note.id}
            noteTitle={note.title}
            generalAccess={note.generalAccess}
            generalAccessPermission={note.generalAccessPermission}
            shareToken={note.shareToken}
          />
        </>
      )}

      {canDelete && (
        <NoteActionsMenu
          noteId={note.id}
          noteTitle={note.title}
          triggerClassName={HEADER_ACTION_CLASSES}
        />
      )}
    </>,
    portalTarget
  );
}
