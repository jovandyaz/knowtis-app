import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useDeleteTag } from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingButton,
} from '@knowtis/design-system';

interface DeleteTagDialogProps {
  tagId: string;
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteTagDialog({
  tagId,
  path,
  open,
  onOpenChange,
  onDeleted,
}: DeleteTagDialogProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const deleteTag = useDeleteTag();

  const handleDelete = () => {
    deleteTag.mutate(tagId, {
      onSuccess: () => {
        onOpenChange(false);
        onDeleted();
      },
      onError: () => {
        toast.error(t('organization.tags.deleteError'));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('labels.closeDialog')}>
        <DialogHeader>
          <DialogTitle>{t('organization.tags.deleteTitle')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-(--muted-foreground)">
          {t('organization.tags.deleteConfirm', { path })}
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
            loading={deleteTag.isPending}
            loadingText={tCommon('buttons.delete')}
            onClick={handleDelete}
          >
            {tCommon('buttons.delete')}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
