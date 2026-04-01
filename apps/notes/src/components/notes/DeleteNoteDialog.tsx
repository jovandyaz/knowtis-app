import { useTranslation } from 'react-i18next';

import { AlertTriangle, Loader2 } from 'lucide-react';

import { useDeleteNote } from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';

/**
 * Delete note dialog props interface
 */
interface DeleteNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | null;
  noteTitle: string;
}

export function DeleteNoteDialog({
  open,
  onOpenChange,
  noteId,
  noteTitle,
}: DeleteNoteDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const deleteNote = useDeleteNote();

  const handleDelete = () => {
    if (!noteId) {
      return;
    }

    deleteNote.mutate(noteId, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--destructive)/10">
              <AlertTriangle className="h-5 w-5 text-(--destructive)" />
            </div>
            <DialogTitle>{t('delete.title')}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {t('delete.confirmMessage')}{' '}
            <span className="font-medium text-(--foreground)">
              &quot;{noteTitle}&quot;
            </span>
            ? {t('delete.warning')}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteNote.isPending}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteNote.isPending}
            autoFocus
          >
            {deleteNote.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('delete.buttonLoading')}
              </>
            ) : (
              t('delete.button')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
