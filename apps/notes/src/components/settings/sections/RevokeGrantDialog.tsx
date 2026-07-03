import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useRevokeGrant } from '@knowtis/data-access-oauth';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingButton,
} from '@knowtis/design-system';

interface RevokeGrantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grantId: string;
  appName: string;
}

export function RevokeGrantDialog({
  open,
  onOpenChange,
  grantId,
  appName,
}: RevokeGrantDialogProps) {
  const { t } = useTranslation('common');
  const revokeGrant = useRevokeGrant();

  const handleRevoke = () => {
    revokeGrant.mutate(grantId, {
      onSuccess: () => {
        toast.success(t('connectedApps.revokeSuccess'));
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
          <DialogTitle>{t('connectedApps.revokeTitle')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-(--muted-foreground)">
          {t('connectedApps.revokeConfirm', { name: appName })}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('connectedApps.cancel')}
          </Button>
          <LoadingButton
            type="button"
            variant="destructive"
            loading={revokeGrant.isPending}
            loadingText={t('connectedApps.revoke')}
            onClick={handleRevoke}
          >
            {t('connectedApps.revoke')}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
