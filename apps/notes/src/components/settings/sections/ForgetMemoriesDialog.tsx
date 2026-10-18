import { useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import {
  useForgetAllMemories,
  useForgetMemory,
} from '@knowtis/data-access-agent';
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

export type ForgetMemoriesTarget = { memoryId: string } | { count: number };

interface ForgetMemoriesDialogProps {
  target: ForgetMemoriesTarget;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function ForgetMemoriesDialog({
  target,
  onClose,
  returnFocusRef,
}: ForgetMemoriesDialogProps) {
  const { t } = useTranslation('common');
  const forgot = useRef(false);
  const forgetOne = useForgetMemory({
    onSuccess: () => toast.success(t('memory.forget.oneDone')),
    onError: () => toast.error(t('memory.forget.oneFailed')),
  });
  const forgetAll = useForgetAllMemories({
    onSuccess: (deleted) =>
      toast.success(t('memory.forget.allDone', { count: deleted })),
    onError: () => toast.error(t('memory.forget.allFailed')),
  });
  const busy = forgetAll.isPending;
  const one = 'memoryId' in target;
  const confirmLabel = one
    ? t('memory.forget.oneConfirm')
    : t('memory.forget.allConfirm');

  const confirm = () => {
    if ('memoryId' in target) {
      forgot.current = true;
      forgetOne.mutate(target.memoryId);
      onClose();
      return;
    }
    forgetAll.mutate(undefined, {
      onSuccess: () => {
        forgot.current = true;
      },
      onSettled: onClose,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogContent
        closeLabel={t('labels.closeDialog')}
        closeDisabled={busy}
        onCloseAutoFocus={(event) => {
          if (forgot.current) {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {one ? t('memory.forget.oneTitle') : t('memory.forget.allTitle')}
          </DialogTitle>
          <DialogDescription>
            {'count' in target
              ? t('memory.forget.allBody', { count: target.count })
              : t('memory.forget.oneBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            {t('buttons.cancel')}
          </Button>
          <LoadingButton
            type="button"
            variant="destructive"
            loading={busy}
            loadingText={confirmLabel}
            onClick={confirm}
          >
            {confirmLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
