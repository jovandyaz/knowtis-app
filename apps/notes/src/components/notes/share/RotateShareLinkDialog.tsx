import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { ShareActionLock } from '@/hooks/useShareActionLock';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import { useRotateShareLink } from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';
import type { Note } from '@knowtis/shared-types';

const NO_RESPONSE_STATUS = 0;
const HTTP_CONFLICT = 409;
const HTTP_SERVER_ERROR = 500;

interface RotateShareLinkDialogProps {
  note: Note;
  isOwner: boolean;
  disabled: boolean;
  actionLock: ShareActionLock;
}

export function RotateShareLinkDialog({
  note,
  isOwner,
  disabled,
  actionLock,
}: RotateShareLinkDialogProps) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<
    | 'share.rotation.conflict'
    | 'share.rotation.uncertain'
    | 'share.rotation.failed'
    | null
  >(null);
  const rotate = useRotateShareLink(note.id);
  const pending = actionLock.pending || rotate.isPending;

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || pending || !isOwner || !note.shareToken || errorKey) {
      return;
    }
    void actionLock.run(async () => {
      try {
        await rotate.mutateAsync();
        setOpen(false);
        toast.success(t('share.rotation.saved'));
      } catch (error) {
        const status =
          error instanceof ApiClientError ? error.status : NO_RESPONSE_STATUS;
        setErrorKey(
          status === HTTP_CONFLICT
            ? 'share.rotation.conflict'
            : status === NO_RESPONSE_STATUS || status >= HTTP_SERVER_ERROR
              ? 'share.rotation.uncertain'
              : 'share.rotation.failed'
        );
      }
    });
  };

  if (!isOwner || !note.shareToken) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        onClick={() => {
          setErrorKey(null);
          setOpen(true);
        }}
      >
        {t('share.rotation.action')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) {
            setOpen(next);
          }
        }}
      >
        <DialogContent closeLabel={t('share.rotation.close')}>
          <form
            onSubmit={confirm}
            className="flex flex-col gap-4"
            aria-busy={pending}
          >
            <DialogHeader>
              <DialogTitle>{t('share.rotation.title')}</DialogTitle>
              <DialogDescription>
                {t('share.rotation.description')}
              </DialogDescription>
            </DialogHeader>
            {errorKey ? (
              <p role="alert" className="text-sm text-(--destructive)">
                {t(errorKey)}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {t(errorKey ? 'share.rotation.close' : 'share.rotation.cancel')}
              </Button>
              {!errorKey ? (
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={disabled || pending}
                >
                  {t('share.rotation.confirm')}
                </Button>
              ) : null}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
