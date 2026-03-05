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
  type: 'notes' | 'ai';
  open: boolean;
  onClose: () => void;
}

export function AnonymousLimitModal({
  type,
  open,
  onClose,
}: AnonymousLimitModalProps) {
  const { t } = useTranslation('common');

  const title = t(
    type === 'notes' ? 'anonymous.limit.notesTitle' : 'anonymous.limit.aiTitle'
  );
  const description = t(
    type === 'notes'
      ? 'anonymous.limit.notesDescription'
      : 'anonymous.limit.aiDescription',
    {
      maxNotes: ANONYMOUS_LIMITS.maxNotes,
      maxAiRequests: ANONYMOUS_LIMITS.maxAiRequestsPerDay,
    }
  );

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
