import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { getRouteApi, useNavigate } from '@tanstack/react-router';

import { BucketDot } from '@/components/organization/BucketDot';
import { BucketEmptyState } from '@/components/organization/BucketEmptyState';
import { ViewEmptyState } from '@/components/organization/ViewEmptyState';
import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { ROUTES } from '@/config';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel';
import { DEBOUNCE_DELAYS } from '@/lib';
import { notesSearchSchema } from '@/routes/_app/notes/index';
import { useAIStore } from '@/stores/ai.store';
import { useNotesSearchStore } from '@/stores/notes-search.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useNotes } from '@knowtis/data-access-notes';
import {
  Button,
  ErrorState,
  Input,
  SegmentedControl,
} from '@knowtis/design-system';
import { useDebounce } from '@knowtis/shared-hooks';
import {
  NOTE_LIST_VIEWS,
  type NoteListView,
  type NotesListFilters,
} from '@knowtis/shared-types';

import { EmptyState } from './EmptyState';
import { FloatingCreateButton } from './FloatingCreateButton';
import { NoteCard } from './NoteCard';
import { NoteCardSkeleton } from './NoteCardSkeleton';

const routeApi = getRouteApi('/_app/notes/');

const INITIAL_SKELETONS = 6;
const NEXT_PAGE_SKELETONS = 3;

export function NoteList() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const isAnonymous = useAuthUser()?.isAnonymous ?? false;
  const { createNote } = useCreateNoteAction();

  // The route tree's types are circular through this component, so useSearch()
  // widens the validated params back to plain strings; re-parsing restores them.
  const { bucket, view: requestedView } = notesSearchSchema.parse(
    routeApi.useSearch()
  );
  // Anonymous visitors get no view picker, so a view left in the URL would
  // filter them into an empty list they have no control to clear.
  const view = isAnonymous ? 'all' : requestedView;
  const navigate = useNavigate();

  const { query, setQuery, focusRequested, clearFocusRequest } =
    useNotesSearchStore();

  const debouncedSearch = useDebounce(query, DEBOUNCE_DELAYS.SEARCH);

  useEffect(() => {
    if (focusRequested) {
      searchInputRef.current?.focus();
      clearFocusRequest();
    }
  }, [focusRequested, clearFocusRequest]);

  const filters: NotesListFilters = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(bucket ? { bucket } : {}),
    ...(view !== 'all' ? { view } : {}),
  };

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotes(filters);

  const notes = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const sentinelRef = useInfiniteScrollSentinel({
    hasMore: hasNextPage,
    isLoading: isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
  });

  const setView = (next: NoteListView) =>
    void navigate({
      to: ROUTES.NOTES,
      search: { ...(bucket ? { bucket } : {}), view: next },
    });

  const clearBucket = () =>
    void navigate({ to: ROUTES.NOTES, search: { view } });

  const renderEmptyState = () => {
    if (bucket) {
      return <BucketEmptyState bucket={bucket} />;
    }
    if (view !== 'all') {
      return <ViewEmptyState view={view} />;
    }
    return <EmptyState hasSearch={!!debouncedSearch} />;
  };

  const renderNotes = () => {
    if (isLoading) {
      return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: INITIAL_SKELETONS }).map((_, i) => (
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
              {renderEmptyState()}
            </motion.div>
          ) : (
            notes.map((note) => <NoteCard key={note.id} note={note} />)
          )}
          {isFetchingNextPage &&
            Array.from({ length: NEXT_PAGE_SKELETONS }).map((_, i) => (
              <NoteCardSkeleton key={`next-${i}`} />
            ))}
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
        <div className="flex items-center gap-3">
          {!isAnonymous && (
            <SegmentedControl
              aria-label={t('organization.viewsLabel')}
              value={view}
              onValueChange={setView}
              options={NOTE_LIST_VIEWS.map((v) => ({
                value: v,
                label: t(`organization.views.${v}`),
              }))}
            />
          )}
          <div className="hidden md:flex md:items-center md:gap-3">
            {aiEnabled && <VoiceNoteRecorder size="default" />}
            <Button className="gap-2" onClick={createNote}>
              <Plus className="h-4 w-4" />
              {t('create.newNote')}
            </Button>
          </div>
        </div>
      </div>

      {bucket && (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={clearBucket}
            aria-label={t('organization.clearBucketFilter', {
              bucket: t(`organization.buckets.${bucket}`),
            })}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-muted/25 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <BucketDot bucket={bucket} className="size-2" />
            {t(`organization.buckets.${bucket}`)}
            <X className="h-3 w-3 opacity-70" />
          </button>
          {!isLoading && !isError && (
            <span className="text-xs text-muted-foreground/70">
              {t('organization.notesCount', { count: total })}
            </span>
          )}
        </div>
      )}

      {renderNotes()}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      <FloatingCreateButton onCreateNote={createNote} />
    </div>
  );
}
