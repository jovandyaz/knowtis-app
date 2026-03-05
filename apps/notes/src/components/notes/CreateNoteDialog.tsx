import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { Loader2, Plus } from 'lucide-react';

import { ApiClientError } from '@knowtis/api-client';
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

import { AnonymousLimitModal } from '../anonymous/AnonymousLimitModal';

interface CreateNoteDialogProps {
  trigger?: ReactNode;
}

export function CreateNoteDialog({ trigger }: CreateNoteDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const [open, setOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showLimitModal, setShowLimitModal] = useState(false);

  const createNote = useCreateNote();
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('create.titleRequired'));
      return;
    }

    if (trimmedTitle.length > 200) {
      setError(t('create.titleTooLong'));
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
          if (
            ApiClientError.isApiClientError(err) &&
            err.code === 'ANONYMOUS_NOTE_LIMIT'
          ) {
            setOpen(false);
            setShowLimitModal(true);
            return;
          }
          setError(
            err instanceof Error ? err.message : t('create.failedToCreate')
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

  const defaultTrigger = (
    <Button className="gap-2">
      <Plus className="h-4 w-4" />
      {t('create.newNote')}
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>

        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t('create.title')}</DialogTitle>
              <DialogDescription>{t('create.description')}</DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Input
                placeholder={t('create.placeholder')}
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
                {t('common:buttons.cancel')}
              </Button>
              <Button type="submit" disabled={createNote.isPending}>
                {createNote.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('create.buttonLoading')}
                  </>
                ) : (
                  t('create.button')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AnonymousLimitModal
        type="notes"
        open={showLimitModal}
        onClose={() => setShowLimitModal(false)}
      />
    </>
  );
}
