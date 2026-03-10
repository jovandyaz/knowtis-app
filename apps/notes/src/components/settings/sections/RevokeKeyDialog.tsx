import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useRevokeMcpKey } from '@knowtis/data-access-mcp-keys';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingButton,
} from '@knowtis/design-system';

interface RevokeKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string;
  keyName: string;
}

export function RevokeKeyDialog({
  open,
  onOpenChange,
  keyId,
  keyName,
}: RevokeKeyDialogProps) {
  const { t } = useTranslation('common');
  const revokeKey = useRevokeMcpKey();

  const handleRevoke = () => {
    revokeKey.mutate(keyId, {
      onSuccess: () => {
        toast.success(t('integrations.revokeSuccess'));
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('integrations.revokeTitle')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-(--muted-foreground)">
          {t('integrations.revokeConfirm', { name: keyName })}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('integrations.done')}
          </Button>
          <LoadingButton
            type="button"
            variant="destructive"
            loading={revokeKey.isPending}
            loadingText={t('integrations.revoke')}
            onClick={handleRevoke}
          >
            {t('integrations.revoke')}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
