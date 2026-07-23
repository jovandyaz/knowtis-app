import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { DEBOUNCE_DELAYS } from '@/lib';
import { useAIStore } from '@/stores/ai.store';
import { useNotesSearchStore } from '@/stores/notes-search.store';
import { Plus, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useNotes } from '@knowtis/data-access-notes';
import { Button, ErrorState, Input } from '@knowtis/design-system';
import { useDebounce } from '@knowtis/shared-hooks';

import { EmptyState } from './EmptyState';
import { FloatingCreateButton } from './FloatingCreateButton';
import { NoteCard } from './NoteCard';
import { NoteCardSkeleton } from './NoteCardSkeleton';

export function NoteList() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const { createNote } = useCreateNoteAction();

  const { query, setQuery, focusRequested, clearFocusRequest } =
    useNotesSearchStore();

  const debouncedSearch = useDebounce(query, DEBOUNCE_DELAYS.SEARCH);

  useEffect(() => {
    if (focusRequested) {
      searchInputRef.current?.focus();
      clearFocusRequest();
    }
  }, [focusRequested, clearFocusRequest]);

  const {
    data: notes = [],
    isLoading,
    isError,
    error,
  } = useNotes(debouncedSearch);

  const renderNotes = () => {
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
          title={t('list.errorLoading')}
          message={
            error instanceof Error
              ? error.message
              : tCommon('errors.tryAgainLater')
          }
        />
      );
    }

    return (
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
            notes.map((note) => <NoteCard key={note.id} note={note} />)
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder={t('list.searchPlaceholder')}
            className="pl-10 h-11 bg-card/50 backdrop-blur-sm border-border/50 focus-visible:ring-primary/30 transition-all"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="hidden md:flex md:items-center md:gap-3">
          {aiEnabled && <VoiceNoteRecorder size="default" />}
          <Button className="gap-2" onClick={createNote}>
            <Plus className="h-4 w-4" />
            {t('create.newNote')}
          </Button>
        </div>
      </div>

      {renderNotes()}

      <FloatingCreateButton onCreateNote={createNote} />
    </div>
  );
}
