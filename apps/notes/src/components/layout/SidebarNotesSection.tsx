import { useTranslation } from 'react-i18next';

import { Link, useParams } from '@tanstack/react-router';

import { NoteActionsMenu } from '@/components/notes/NoteActionsMenu';
import {
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from '@/components/organization/nav-row.styles';
import { ROUTES, STORAGE_KEYS } from '@/config';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { canPerformNoteAction } from '@/lib';
import { preloadEditorChunk } from '@/lib/preload-editor';
import { ChevronDown, ChevronRight, FileText, Plus } from 'lucide-react';

import { useRecentNotes } from '@knowtis/data-access-notes';
import { useCollapsible } from '@knowtis/shared-hooks';

const SIDEBAR_RECENT_NOTES = 20;

export function SidebarNotesSection() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsible(
    STORAGE_KEYS.SIDEBAR_NOTES_COLLAPSED
  );
  const { data: notes } = useRecentNotes(SIDEBAR_RECENT_NOTES);
  const { createNote } = useCreateNoteAction();
  const params = useParams({ strict: false }) as { noteId?: string };
  const activeNoteId = params.noteId;

  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {tCommon('labels.notes')}
        </span>

        <div
          className={`${NAV_ROW} ${NAV_ROW_IDLE} relative has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-(--ring)`}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`${NAV_ICON_SLOT} relative z-10 cursor-pointer after:absolute after:-inset-1 after:content-['']`}
            title={
              isCollapsed
                ? tCommon('labels.expand')
                : tCommon('labels.collapse')
            }
          >
            <ChevronIcon className="h-3.5 w-3.5 shrink-0" />
          </button>
          <Link
            to={ROUTES.NOTES}
            className="flex min-w-0 flex-1 items-center after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            <span className={`${NAV_LABEL} font-medium`}>
              {t('sidebar.myNotes')}
            </span>
          </Link>

          <button
            type="button"
            onClick={createNote}
            onPointerDown={preloadEditorChunk}
            className="relative z-10 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
            title={t('sidebar.newNote')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-0.5">
            {notes?.map((note) => (
              <div
                key={note.id}
                className="group/note relative flex items-center"
              >
                <Link
                  to={ROUTES.NOTE}
                  params={{ noteId: note.id }}
                  className={`${NAV_ROW} pr-8 ${
                    activeNoteId === note.id ? NAV_ROW_ACTIVE : NAV_ROW_IDLE
                  }`}
                >
                  <span className={NAV_ICON_SLOT}>
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                  </span>
                  <span className={NAV_LABEL}>
                    {note.title || t('sidebar.untitled')}
                  </span>
                </Link>
                {canPerformNoteAction(note.accessLevel, 'delete') && (
                  <div className="absolute right-0.5 z-10 opacity-100 transition-opacity md:opacity-0 md:group-hover/note:opacity-100 md:focus-within:opacity-100">
                    <NoteActionsMenu
                      noteId={note.id}
                      noteTitle={note.title || t('sidebar.untitled')}
                    />
                  </div>
                )}
              </div>
            ))}

            {notes?.length === 0 && (
              <span className="px-2 py-1 text-xs text-muted-foreground/60">
                {t('sidebar.noNotesYet')}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
