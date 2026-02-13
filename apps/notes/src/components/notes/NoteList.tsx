import { useCallback, useState } from 'react';

import { DEBOUNCE_DELAYS } from '@/lib';
import { Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useNotes } from '@knowtis/data-access-notes';
import { ErrorState, Input } from '@knowtis/design-system';
import { useDebounce } from '@knowtis/shared-hooks';

import { CreateNoteDialog } from './CreateNoteDialog';
import { DeleteNoteDialog } from './DeleteNoteDialog';
import { EmptyState } from './EmptyState';
import { NoteCard } from './NoteCard';
import { NoteCardSkeleton } from './NoteCardSkeleton';

export function NoteList() {
  const [localSearch, setLocalSearch] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  const debouncedSearch = useDebounce(localSearch, DEBOUNCE_DELAYS.SEARCH);

  const {
    data: notes = [],
    isLoading,
    isError,
    error,
  } = useNotes(debouncedSearch);

  const noteToDeleteData = notes.find((n) => n.id === noteToDelete);

  const handleDelete = useCallback((id: string) => {
    setNoteToDelete(id);
  }, []);

  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Error loading notes"
        message={
          error instanceof Error ? error.message : 'Please try again later'
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            type="search"
            placeholder="Search notes..."
            className="pl-10 h-11 bg-card/50 backdrop-blur-sm border-border/50 focus-visible:ring-primary/30 transition-all"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <CreateNoteDialog />
      </div>

      <motion.div layout className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {notes.length === 0 ? (
            <motion.div
              layout
              className="col-span-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState hasSearch={!!debouncedSearch} />
            </motion.div>
          ) : (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} onDelete={handleDelete} />
            ))
          )}
        </AnimatePresence>
      </motion.div>

      <DeleteNoteDialog
        open={!!noteToDelete}
        onOpenChange={(open) => !open && setNoteToDelete(null)}
        noteId={noteToDelete}
        noteTitle={noteToDeleteData?.title ?? ''}
      />
    </div>
  );
}
