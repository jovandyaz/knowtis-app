import { useTranslation } from 'react-i18next';

import { Globe, Lock } from 'lucide-react';

import { useUpdateNote } from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';
import {
  ACCESS,
  GENERAL_ACCESS,
  PERMISSION,
  type GeneralAccessLevel,
  type NoteAccessLevel,
  type PermissionLevel,
} from '@knowtis/shared-types';

import {
  AccessInfoBanner,
  AccessOptionCard,
  EditorsCanShareToggle,
  LinkAccessSection,
} from './share';

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

  const isOwner = accessLevel === ACCESS.OWNER;
  const isEditor = accessLevel === PERMISSION.EDITOR;
  const canShare = isOwner || (isEditor && editorsCanShare);
  const isPublicAccess = generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK;
  const shareUrl = shareToken
    ? `${window.location.origin}/s/${shareToken}`
    : null;

  const handleUpdate = (input: Record<string, unknown>) => {
    updateNote.mutate({ id: noteId, input });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] p-0 gap-0 overflow-hidden">
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

            <div className="space-y-2">
              <AccessOptionCard
                selected={!isPublicAccess}
                disabled={!canShare || updateNote.isPending}
                onClick={() =>
                  handleUpdate({ generalAccess: GENERAL_ACCESS.RESTRICTED })
                }
                icon={Lock}
                title={t('share.restricted')}
                description={t('share.restrictedDesc')}
              />
              <AccessOptionCard
                selected={isPublicAccess}
                disabled={!canShare || updateNote.isPending}
                onClick={() =>
                  handleUpdate({
                    generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
                  })
                }
                icon={Globe}
                title={t('share.anyoneWithLink')}
                description={t('share.anyoneWithLinkDesc')}
              />
            </div>
          </div>

          {isPublicAccess && shareUrl && (
            <LinkAccessSection
              shareUrl={shareUrl}
              permission={generalAccessPermission}
              disabled={!canShare || updateNote.isPending}
              onPermissionChange={(permission: PermissionLevel) =>
                handleUpdate({ generalAccessPermission: permission })
              }
            />
          )}

          {isOwner && (
            <EditorsCanShareToggle
              enabled={editorsCanShare}
              disabled={updateNote.isPending}
              onToggle={() =>
                handleUpdate({ editorsCanShare: !editorsCanShare })
              }
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
