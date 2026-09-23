import { useTranslation } from 'react-i18next';

import { captureProductEvent } from '@/lib/analytics/product-events';
import { useAgentStore } from '@/stores/agent.store';
import { toast } from 'sonner';

import { useDeleteConversation } from '@knowtis/data-access-agent';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingButton,
} from '@knowtis/design-system';

import { conversationErrorKey } from './conversation-error';

interface DeleteConversationDialogProps {
  conversationId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function DeleteConversationDialog({
  conversationId,
  title,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: DeleteConversationDialogProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const remove = useDeleteConversation({
    onSuccess: () => {
      captureProductEvent('ai conversation deleted', { source: 'switcher' });
      toast.success(t('ai.copilot.history.deleted'));
    },
    onError: (error) => {
      toast.error(t(conversationErrorKey(error)));
    },
  });
  const newConversation = useAgentStore((s) => s.newConversation);

  const confirm = () => {
    if (useAgentStore.getState().conversationId === conversationId) {
      newConversation();
    }
    remove.mutate(conversationId, { onSettled: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={tCommon('labels.closeDialog')}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>
            {t('ai.copilot.history.deleteConfirmTitle')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-(--muted-foreground)">
          {t('ai.copilot.history.deleteConfirmBody', { title })}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {tCommon('buttons.cancel')}
          </Button>
          <LoadingButton
            type="button"
            variant="destructive"
            loading={remove.isPending}
            loadingText={tCommon('buttons.delete')}
            onClick={confirm}
          >
            {tCommon('buttons.delete')}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
