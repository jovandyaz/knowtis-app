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
            <DialogTitle>Delete Note</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Are you sure you want to delete{' '}
            <span className="font-medium text-(--foreground)">
              &quot;{noteTitle}&quot;
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteNote.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteNote.isPending}
          >
            {deleteNote.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
