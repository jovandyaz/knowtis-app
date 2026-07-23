import { useTranslation } from 'react-i18next';

import { useNavigate, useParams } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useDeleteNote, useRestoreNote } from '@knowtis/data-access-notes';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@knowtis/design-system';

const DELETE_TOAST_DURATION_MS = 6000;

interface NoteActionsMenuProps {
  noteId: string;
  noteTitle: string;
}

export function NoteActionsMenu({ noteId, noteTitle }: NoteActionsMenuProps) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { noteId?: string };
  const deleteNote = useDeleteNote();
  const restoreNote = useRestoreNote();

  const handleDelete = () => {
    const isOpenNote = params.noteId === noteId;
    deleteNote.mutate(noteId, {
      onSuccess: () => {
        if (isOpenNote) {
          navigate({ to: ROUTES.NOTES });
        }
        toast.success(t('delete.deleted'), {
          action: {
            label: t('delete.undo'),
            onClick: () => restoreNote.mutate(noteId),
          },
          duration: DELETE_TOAST_DURATION_MS,
        });
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:h-8 md:w-8 text-(--muted-foreground) hover:text-(--foreground)"
          aria-label={t('delete.menuLabel', { title: noteTitle })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-(--destructive) focus:bg-(--destructive)/10 focus:text-(--destructive)"
          onSelect={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          {t('delete.button')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
