import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { useAuthUser } from '@jovandyaz/auth-react';
import { Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { ZodError } from 'zod';

import { ApiClientError } from '@knowtis/api-client';
import {
  notesQueryKeys,
  usePeople,
  useSharingAuthority,
  useUpdateNote,
} from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ErrorState,
  RadioCardGroup,
  Skeleton,
  Switch,
} from '@knowtis/design-system';
import {
  GENERAL_ACCESS,
  PERMISSION,
  type GeneralAccessLevel,
  type NoteAccessLevel,
  type PermissionLevel,
  type UpdateNoteInput,
} from '@knowtis/shared-types';

import { sharedNotePath } from '../../config';
import {
  useShareActionLock,
  type ShareActionLock,
} from '../../hooks/useShareActionLock';
import { useVerifyEmailGate } from '../../hooks/useVerifyEmailGate';
import { AccessInfoBanner } from './share/AccessInfoBanner';
import { LinkAccessSection } from './share/LinkAccessSection';
import { PeopleAccessSection } from './share/PeopleAccessSection';
import { RotateShareLinkDialog } from './share/RotateShareLinkDialog';

type ToastKey =
  | 'share.linkCreatedToast'
  | 'share.linkPausedToast'
  | 'share.linkResumedToast'
  | 'share.permissionEditorToast'
  | 'share.permissionViewerToast'
  | 'share.people.saved';

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

export function ShareDialog(props: ShareDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const actionLock = useShareActionLock();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] min-w-0 flex-col gap-0 overflow-hidden p-0 md:max-w-[520px] md:p-0 max-md:p-0"
        closeLabel={t('common:labels.closeDialog')}
      >
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6 pr-12">
          <DialogTitle className="break-words">
            {t('share.title', { noteTitle: props.noteTitle })}
          </DialogTitle>
          <DialogDescription>{t('share.description')}</DialogDescription>
        </DialogHeader>
        <div role="separator" className="shrink-0 border-t border-(--border)" />
        {props.open ? (
          <ShareDialogAccess
            key={props.noteId}
            {...props}
            actionLock={actionLock}
          />
        ) : null}
        <div role="separator" className="shrink-0 border-t border-(--border)" />
        <div className="flex shrink-0 justify-end px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t('common:buttons.done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogAccess({
  noteId,
  generalAccess: initialAccess,
  generalAccessPermission: initialPermission,
  shareToken: initialToken,
  actionLock,
}: ShareDialogProps & { actionLock: ShareActionLock }) {
  const { t } = useTranslation(['notes', 'common']);
  const actor = useAuthUser();
  const people = usePeople(noteId, true);
  const authority = useSharingAuthority(noteId, true);
  const updateNote = useUpdateNote();
  const client = useQueryClient();
  const gate = useVerifyEmailGate();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<string | null>(null);
  const hasFreshData =
    people.isFetchedAfterMount &&
    authority.isFetchedAfterMount &&
    people.isSuccess &&
    authority.isSuccess;
  const refreshing = people.isFetching || authority.isFetching;
  const disabled =
    !hasFreshData || refreshing || actionLock.pending || updateNote.isPending;
  const freshPeople = hasFreshData ? people.data : [];
  const isOwner =
    hasFreshData &&
    authority.data.ownerId === actor?.id &&
    freshPeople.some(
      (person) => person.permission === 'owner' && person.user.id === actor?.id
    );
  const isDirectEditor =
    hasFreshData &&
    authority.data.editorsCanShare &&
    freshPeople.some(
      (person) => person.permission === 'editor' && person.user.id === actor?.id
    );
  const canManagePeople = isOwner || isDirectEditor;
  const generalAccess = authority.data?.generalAccess ?? initialAccess;
  const permission =
    authority.data?.generalAccessPermission ?? initialPermission;
  const shareToken = authority.data ? authority.data.shareToken : initialToken;
  const linkIsOpen = generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK;
  const shareUrl = shareToken
    ? `${window.location.origin}${sharedNotePath(shareToken)}`
    : null;
  const refreshError = people.error ?? authority.error;
  const denied =
    ApiClientError.isApiClientError(refreshError) &&
    [401, 403, 404].includes(refreshError.status);

  const retry = () => {
    void Promise.all([
      people.refetch(),
      authority.refetch(),
      client.invalidateQueries({ queryKey: notesQueryKeys.detail(noteId) }),
    ]);
  };
  const applyAccessChange = (input: UpdateNoteInput, successKey: ToastKey) => {
    if (disabled || !isOwner) {
      return;
    }
    void actionLock.run(async () => {
      setAccessError(null);
      setAccessStatus(null);
      try {
        await updateNote.mutateAsync({ id: noteId, input });
        setAccessStatus(t(successKey));
        toast.success(t(successKey));
      } catch (error) {
        if (gate.handleError(error)) {
          setAccessError(t('share.people.verifyRequired'));
        } else {
          setAccessError(t('share.accessChangeError'));
          toast.error(t('share.accessChangeError'));
        }
      } finally {
        await Promise.all([
          client.invalidateQueries({ queryKey: notesQueryKeys.people(noteId) }),
          client.invalidateQueries({
            queryKey: notesQueryKeys.sharingAuthority(noteId),
          }),
          // Reuse the detail read because useUpdateNote starts it after the write settles.
          client.invalidateQueries(
            { queryKey: notesQueryKeys.detail(noteId) },
            { cancelRefetch: false }
          ),
        ]);
      }
    });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto px-6 py-5">
      {refreshError ? (
        <ErrorState
          role="alert"
          fullHeight={false}
          title={t(
            denied
              ? 'share.people.denied'
              : refreshError instanceof ZodError
                ? 'share.people.invalidResponse'
                : 'share.people.refreshError'
          )}
          message={t('share.people.retryHelp')}
          {...(!refreshing ? { onRetry: retry } : {})}
          retryLabel={t('share.people.retry')}
        />
      ) : refreshing ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm text-(--muted-foreground)">
            {t(
              hasFreshData ? 'share.people.refreshing' : 'share.people.loading'
            )}
          </p>
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : null}
      {!refreshError && hasFreshData && !canManagePeople ? (
        <p role="alert" className="text-sm text-(--muted-foreground)">
          {t('share.people.denied')}
        </p>
      ) : null}
      <PeopleAccessSection
        noteId={noteId}
        actorId={actor?.id}
        people={canManagePeople ? freshPeople : []}
        disabled={disabled || !canManagePeople}
        linkIsOpen={linkIsOpen}
        actionLock={actionLock}
      />
      <div role="separator" className="shrink-0 border-t border-(--border)" />
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-(--muted-foreground)" />
          <h3 className="text-sm font-medium">{t('share.generalAccess')}</h3>
        </div>
        <RadioCardGroup
          aria-label={t('share.generalAccess')}
          options={[
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
          ]}
          value={generalAccess}
          onValueChange={(next) => {
            if (next !== generalAccess) {
              applyAccessChange(
                { generalAccess: next },
                accessToastKey(next, shareToken)
              );
            }
          }}
          disabled={disabled || !isOwner}
        />
      </div>
      {linkIsOpen && shareUrl ? (
        <LinkAccessSection
          shareUrl={shareUrl}
          permission={permission}
          disabled={disabled || !isOwner}
          onPermissionChange={(next) => {
            if (next !== permission) {
              applyAccessChange(
                { generalAccessPermission: next },
                next === PERMISSION.EDITOR
                  ? 'share.permissionEditorToast'
                  : 'share.permissionViewerToast'
              );
            }
          }}
        />
      ) : null}
      {authority.data ? (
        <RotateShareLinkDialog
          note={authority.data}
          isOwner={isOwner}
          disabled={disabled}
          actionLock={actionLock}
        />
      ) : null}
      {isOwner ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`editors-share-${noteId}`}
              className="text-sm font-medium"
            >
              {t('share.editorsCanShare')}
            </label>
            <p className="text-xs text-(--muted-foreground)">
              {t('share.editorsCanShareToggleDesc')}
            </p>
          </div>
          <Switch
            id={`editors-share-${noteId}`}
            checked={authority.data?.editorsCanShare ?? false}
            disabled={disabled}
            onCheckedChange={(next) =>
              applyAccessChange({ editorsCanShare: next }, 'share.people.saved')
            }
          />
        </div>
      ) : hasFreshData ? (
        <AccessInfoBanner canShare={canManagePeople} />
      ) : null}
      {accessError ? (
        <p role="alert" className="text-sm text-(--destructive)">
          {accessError}
        </p>
      ) : null}
      {accessStatus ? (
        <p role="status" className="text-sm text-(--muted-foreground)">
          {accessStatus}
        </p>
      ) : null}
    </div>
  );
}
