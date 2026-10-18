import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';

const COPIED_FEEDBACK_MS = 2000;
const LINK_CONFIRMATION_ATTRIBUTE = 'data-link-confirmation';

export function isInLinkConfirmation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const layer = target.hasAttribute('data-knowtis-dialog-overlay')
    ? target.nextElementSibling
    : target.closest('[data-knowtis-dialog-content]');
  return layer?.hasAttribute(LINK_CONFIRMATION_ATTRIBUTE) === true;
}

function resolveUrl(url: string): URL | null {
  try {
    return new URL(url, window.location.href);
  } catch {
    return null;
  }
}

export interface LinkConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  url: string;
}

function CopyLinkButton({ address }: { address: string }) {
  const { t } = useTranslation(['notes', 'common']);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(
        () => setCopied(false),
        COPIED_FEEDBACK_MS
      );
    } catch (error) {
      console.error('[LinkConfirmationDialog] clipboard write failed', error);
    }
  };

  return (
    <Button variant="outline" onClick={copy}>
      {copied ? t('common:buttons.copied') : t('common:buttons.copyLink')}
    </Button>
  );
}

export function LinkConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  url,
}: LinkConfirmationDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const resolved = resolveUrl(url);
  const address = resolved?.href ?? url;

  const confirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        closeLabel={t('common:labels.closeDialog')}
        {...{ [LINK_CONFIRMATION_ATTRIBUTE]: '' }}
      >
        <DialogHeader>
          <DialogTitle>{t('notes:ai.linkConfirm.title')}</DialogTitle>
          <DialogDescription>
            {t('notes:ai.linkConfirm.description')}
          </DialogDescription>
        </DialogHeader>
        {resolved && (
          <p className="break-all text-lg font-semibold">{resolved.host}</p>
        )}
        <p className="max-h-32 overflow-y-auto break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
          {address}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <CopyLinkButton address={address} />
          <Button onClick={confirm}>{t('notes:ai.linkConfirm.open')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
