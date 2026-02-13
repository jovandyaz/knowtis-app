import { useState, type FormEvent } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { Loader2, Plus } from 'lucide-react';

import { useCreateNote } from '@knowtis/data-access-notes';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@knowtis/design-system';

export function CreateNoteDialog() {
  const [open, setOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [error, setError] = useState<string>('');

  const createNote = useCreateNote();
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }

    if (trimmedTitle.length > 200) {
      setError('Title must be less than 200 characters');
      return;
    }

    createNote.mutate(
      { title: trimmedTitle, content: '' },
      {
        onSuccess: (newNote) => {
          setOpen(false);
          setTitle('');
          setError('');
          navigate({ to: '/notes/$noteId', params: { noteId: newNote.id } });
        },
        onError: (err) => {
          setError(
            err instanceof Error ? err.message : 'Failed to create note'
          );
        },
      }
    );
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTitle('');
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Note
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Note</DialogTitle>
            <DialogDescription>
              Give your note a title. You can edit the content after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              placeholder="Enter note title..."
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              aria-invalid={!!error}
              autoFocus
              disabled={createNote.isPending}
            />
            {error && (
              <p className="mt-2 text-sm text-(--destructive)">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createNote.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createNote.isPending}>
              {createNote.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Note'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
