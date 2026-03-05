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

const messages = {
  notes: {
    title: "You've reached the guest note limit",
    description: `Create a free account to save unlimited notes and access them from any device. Guest accounts are limited to ${ANONYMOUS_LIMITS.maxNotes} notes.`,
  },
  ai: {
    title: 'AI requests limit reached for today',
    description: `Sign up for a free account to get more AI completions daily. Guest accounts are limited to ${ANONYMOUS_LIMITS.maxAiRequestsPerDay} AI requests per day.`,
  },
};

export function AnonymousLimitModal({
  type,
  open,
  onClose,
}: AnonymousLimitModalProps) {
  const { title, description } = messages[type];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Maybe later
          </Button>
          <Link to="/register" className={buttonVariants()}>
            Create free account
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
