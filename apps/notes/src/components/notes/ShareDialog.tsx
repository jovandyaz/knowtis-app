import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsFetching, useQueryClient } from '@tanstack/react-query';

import { sharedNotePath } from '@/config';
import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { notesQueryKeys, useUpdateNote } from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  RadioCardGroup,
} from '@knowtis/design-system';
import {
  ACCESS,
  GENERAL_ACCESS,
  PERMISSION,
  type GeneralAccessLevel,
  type NoteAccessLevel,
  type PermissionLevel,
  type UpdateNoteInput,
} from '@knowtis/shared-types';

import { AccessInfoBanner, LinkAccessSection } from './share';

type ToastKey =
  | 'share.linkCreatedToast'
  | 'share.linkPausedToast'
  | 'share.linkResumedToast'
  | 'share.permissionEditorToast'
  | 'share.permissionViewerToast';

// A retained token means the note was shared before, so resuming returns the same link.
function accessToastKey(
  next: GeneralAccessLevel,
  shareToken: string | null
): ToastKey {
  if (next === GENERAL_ACCESS.RESTRICTED) {
    return 'share.linkPausedToast';
  }
  return shareToken ? 'share.linkResumedToast' : 'share.linkCreatedToast';
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  noteTitle: string;
  generalAccess: GeneralAccessLevel;
  generalAccessPermission: PermissionLevel;
  shareToken: string | null;
  editorsCanShare: boolean;
  accessLevel: NoteAccessLevel;
}

export function ShareDialog({
  open,
  onOpenChange,
  noteId,
  noteTitle,
  generalAccess,
  generalAccessPermission,
  shareToken,
  editorsCanShare,
  accessLevel,
}: ShareDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const updateNote = useUpdateNote();
  const queryClient = useQueryClient();
  const verifyEmailGate = useVerifyEmailGate();

  // The detail query only refetches on its own staleness, so sharing state
  // changed from another tab or device can be minutes old when this opens.
  useEffect(() => {
    if (open) {
      void queryClient.invalidateQueries({
        queryKey: notesQueryKeys.detail(noteId),
      });
    }
  }, [open, queryClient, noteId]);

  const isRefreshing =
    useIsFetching({ queryKey: notesQueryKeys.detail(noteId) }) > 0;

  const isOwner = accessLevel === ACCESS.OWNER;
  const isEditor = accessLevel === ACCESS.EDITOR;
  const canShare = isOwner || (isEditor && editorsCanShare);
  const isPublicAccess = generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK;
  const generalAccessOptions = [
    {
      value: GENERAL_ACCESS.RESTRICTED,
      icon: Lock,
      title: t('share.restricted'),
      description: shareToken
        ? t('share.restrictedDescPaused')
        : t('share.restrictedDesc'),
    },
    {
      value: GENERAL_ACCESS.ANYONE_WITH_LINK,
      icon: Globe,
      title: t('share.anyoneWithLink'),
      description: t('share.anyoneWithLinkDesc'),
    },
  ];
  const shareUrl = shareToken
    ? `${window.location.origin}${sharedNotePath(shareToken)}`
    : null;

  const applyAccessChange = (input: UpdateNoteInput, successKey: ToastKey) => {
    // Per-call mutate callbacks are skipped once the observer loses its
    // listeners, so navigating away would silently drop the confirmation.
    void updateNote
      .mutateAsync({ id: noteId, input })
      .then(() => toast.success(t(successKey)))
      .catch((error: unknown) => {
        if (!verifyEmailGate.handleError(error)) {
          toast.error(t('share.accessChangeError'));
        }
      });
  };

  const handleGeneralAccessChange = (next: GeneralAccessLevel) => {
    if (next !== generalAccess) {
      applyAccessChange(
        { generalAccess: next },
        accessToastKey(next, shareToken)
      );
    }
  };

  const handlePermissionChange = (next: PermissionLevel) => {
    if (next !== generalAccessPermission) {
      applyAccessChange(
        { generalAccessPermission: next },
        next === PERMISSION.EDITOR
          ? 'share.permissionEditorToast'
          : 'share.permissionViewerToast'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[520px] p-0 gap-0 overflow-hidden"
        closeLabel={t('common:labels.closeDialog')}
      >
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1">
          <DialogTitle className="text-xl font-semibold">
            {t('share.title', { noteTitle })}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('share.description')}
          </p>
        </DialogHeader>

        <div className="border-t border-border mb-0" />

        <div className="px-6 py-5 space-y-6 max-h-[500px] overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">
                {t('share.generalAccess')}
              </h3>
            </div>

            <RadioCardGroup
              aria-label={t('share.generalAccess')}
              options={generalAccessOptions}
              value={generalAccess}
              onValueChange={handleGeneralAccessChange}
              disabled={!canShare || updateNote.isPending || isRefreshing}
            />
          </div>

          {isPublicAccess && shareUrl && (
            <LinkAccessSection
              shareUrl={shareUrl}
              permission={generalAccessPermission}
              disabled={!canShare || updateNote.isPending || isRefreshing}
              onPermissionChange={handlePermissionChange}
            />
          )}

          {!isOwner && <AccessInfoBanner canShare={canShare} />}
        </div>

        <div className="border-t border-border mt-0" />
        <div className="px-6 py-4 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:buttons.done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
