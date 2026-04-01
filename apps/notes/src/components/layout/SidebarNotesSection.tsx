import { useTranslation } from 'react-i18next';

import { Link, useParams } from '@tanstack/react-router';

import { ROUTES, STORAGE_KEYS } from '@/config';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { preloadEditorChunk } from '@/lib/preload-editor';
import { ChevronDown, ChevronRight, FileText, Plus } from 'lucide-react';

import { useNotes } from '@knowtis/data-access-notes';
import { useCollapsible } from '@knowtis/shared-hooks';

export function SidebarNotesSection() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsible(
    STORAGE_KEYS.SIDEBAR_NOTES_COLLAPSED
  );
  const { data: notes } = useNotes();
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

        <div className="flex items-center justify-between">
          <div className="flex flex-1 items-center gap-0.5 min-w-0">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-1 text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
              title={
                isCollapsed
                  ? tCommon('labels.expand')
                  : tCommon('labels.collapse')
              }
            >
              <ChevronIcon className="h-3.5 w-3.5" />
            </button>
            <Link
              to={ROUTES.NOTES}
              className="flex-1 truncate rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
            >
              {t('sidebar.myNotes')}
            </Link>
          </div>

          <button
            type="button"
            onClick={createNote}
            onPointerDown={preloadEditorChunk}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
            title={t('sidebar.newNote')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-0.5 pl-2">
            {notes?.map((note) => (
              <Link
                key={note.id}
                to={ROUTES.NOTE}
                params={{ noteId: note.id }}
                className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer truncate ${
                  activeNoteId === note.id
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {note.title || t('sidebar.untitled')}
                </span>
              </Link>
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
