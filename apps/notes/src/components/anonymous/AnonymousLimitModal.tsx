import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import {
  Button,
  buttonVariants,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';
import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

interface AnonymousLimitModalProps {
  open: boolean;
  onClose: () => void;
}

export function AnonymousLimitModal({
  open,
  onClose,
}: AnonymousLimitModalProps) {
  const { t } = useTranslation('common');

  const title = t('anonymous.limit.notesTitle');
  const description = t('anonymous.limit.notesDescription', {
    maxNotes: ANONYMOUS_LIMITS.maxNotes,
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('anonymous.limit.maybeLater')}
          </Button>
          <Link to="/register" className={buttonVariants()}>
            {t('anonymous.limit.createFreeAccount')}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
