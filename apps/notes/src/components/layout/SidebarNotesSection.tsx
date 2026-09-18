import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Link,
  useLocation,
  useParams,
  useSearch,
} from '@tanstack/react-router';

import { NoteActionsMenu } from '@/components/notes/NoteActionsMenu';
import {
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from '@/components/organization/nav-row.styles';
import { SidebarSection } from '@/components/organization/SidebarSection';
import { ROUTES } from '@/config/routes.config';
import { STORAGE_KEYS } from '@/config/storage-keys.config';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { canPerformNoteAction } from '@/lib';
import { preloadEditorChunk } from '@/lib/preload-editor';
import { Files, FileText, Loader2, Plus } from 'lucide-react';

import { useRecentNotes } from '@knowtis/data-access-notes';
import {
  Button,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import type {
  BucketFilter,
  NoteListView,
  Supertag,
} from '@knowtis/shared-types';

const SIDEBAR_RECENT_NOTES = 20;
const SKELETON_ROWS = [0, 1, 2];

export function SidebarNotesSection() {
  const [retryInFlight, setRetryInFlight] = useState(false);
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const {
    data: notes,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useRecentNotes(SIDEBAR_RECENT_NOTES);
  const { createNote } = useCreateNoteAction();
  const params = useParams({ strict: false }) as { noteId?: string };
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as {
    bucket?: BucketFilter;
    tag?: string;
    supertag?: Supertag;
    view?: NoteListView;
  };
  const activeNoteId = params.noteId;
  const onAllNotes =
    pathname === ROUTES.NOTES &&
    !search.bucket &&
    !search.tag &&
    !search.supertag &&
    (search.view ?? 'all') === 'all';

  const retryRecentNotes = async () => {
    if (isFetching) {
      return;
    }
    setRetryInFlight(true);
    try {
      await refetch();
    } finally {
      setRetryInFlight(false);
    }
  };

  return (
    <>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isError ? t('sidebar.loadFailed') : ''}
      </span>
      <SidebarSection
        title={t('sidebar.recentNotes')}
        storageKey={STORAGE_KEYS.SIDEBAR_NOTES_COLLAPSED}
      >
        <div
          className={`${NAV_ROW} ${
            onAllNotes ? NAV_ROW_ACTIVE : NAV_ROW_IDLE
          } relative has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-(--ring)`}
        >
          <span className={NAV_ICON_SLOT} aria-hidden>
            <Files className="h-4 w-4 shrink-0" />
          </span>
          <Link
            to={ROUTES.NOTES}
            search={{ view: 'all' }}
            activeOptions={{ exact: true }}
            activeProps={{}}
            aria-current={onAllNotes ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            <span className={`${NAV_LABEL} font-medium`}>
              {t('sidebar.allNotes')}
            </span>
          </Link>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={createNote}
                onPointerDown={preloadEditorChunk}
                className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
                aria-label={t('sidebar.newNote')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.newNote')}</TooltipContent>
          </Tooltip>
        </div>

        {isPending && !retryInFlight && (
          <div
            role="status"
            aria-label={tCommon('states.loading')}
            className="flex flex-col gap-0.5"
          >
            {SKELETON_ROWS.map((row) => (
              <Skeleton key={row} className="h-8 w-full pointer-coarse:h-11" />
            ))}
          </div>
        )}

        {notes?.map((note) => {
          const title = note.title || t('sidebar.untitled');

          return (
            <div
              key={note.id}
              className="group/note relative flex min-w-0 w-full items-center"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={ROUTES.NOTE}
                    params={{ noteId: note.id }}
                    className={`${NAV_ROW} min-w-0 flex-1 pr-8 pointer-coarse:pr-12 ${
                      activeNoteId === note.id ? NAV_ROW_ACTIVE : NAV_ROW_IDLE
                    }`}
                  >
                    <span className={NAV_ICON_SLOT}>
                      <FileText className="h-4 w-4 shrink-0" />
                    </span>
                    <span
                      className={`${NAV_LABEL} pointer-coarse:line-clamp-2 pointer-coarse:whitespace-normal pointer-coarse:break-words pointer-coarse:text-clip`}
                    >
                      {title}
                    </span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="max-w-72 whitespace-normal break-words"
                >
                  {title}
                </TooltipContent>
              </Tooltip>
              {canPerformNoteAction(note.accessLevel, 'delete') && (
                <div className="absolute right-0.5 z-10 opacity-100 transition-opacity md:pointer-fine:opacity-0 md:pointer-fine:group-hover/note:opacity-100 md:pointer-fine:focus-within:opacity-100">
                  <NoteActionsMenu noteId={note.id} noteTitle={title} />
                </div>
              )}
            </div>
          );
        })}

        {(isError || retryInFlight) && (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1 text-xs text-muted-foreground">
            <span className="min-w-0">{t('sidebar.loadFailed')}</span>
            <Button
              variant="link"
              aria-disabled={isFetching}
              aria-busy={isFetching}
              className="h-auto shrink-0 gap-1 p-0 text-xs"
              onClick={() => void retryRecentNotes()}
            >
              {isFetching && (
                <Loader2
                  aria-hidden
                  className="h-3 w-3 animate-spin motion-reduce:animate-none"
                />
              )}
              {isFetching ? tCommon('states.loading') : t('sidebar.retry')}
            </Button>
          </div>
        )}

        {!isError && notes?.length === 0 && (
          <span className="px-2 py-1 text-xs text-muted-foreground/60">
            {t('sidebar.noNotesYet')}
          </span>
        )}
      </SidebarSection>
    </>
  );
}
