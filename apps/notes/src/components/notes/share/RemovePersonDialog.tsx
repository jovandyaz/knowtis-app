import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingButton,
} from '@knowtis/design-system';
import type { NotePerson } from '@knowtis/shared-types';

interface RemovePersonDialogProps {
  person: NotePerson | undefined;
  linkIsOpen: boolean;
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemovePersonDialog({
  person,
  linkIsOpen,
  pending,
  disabled,
  error,
  onCancel,
  onConfirm,
}: RemovePersonDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={!!person}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent
        closeLabel={t('common:labels.closeDialog')}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="break-words">
            {t('share.people.removeTitle', { name: person?.user.name })}
          </DialogTitle>
          <DialogDescription>
            {t('share.people.removeDescription')}
            {linkIsOpen ? ` ${t('share.people.removeLinkCaveat')}` : ''}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-(--destructive)">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            {t('common:buttons.cancel')}
          </Button>
          <LoadingButton
            variant="destructive"
            disabled={disabled}
            loading={pending}
            loadingText={t('share.people.removing')}
            onClick={onConfirm}
          >
            {t('share.people.removeAccess')}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
