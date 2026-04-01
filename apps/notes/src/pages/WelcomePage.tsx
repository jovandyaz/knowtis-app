import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { preloadEditorChunk } from '@/lib/preload-editor';
import { useAuthUser } from '@jovandyaz/auth-react';
import { FilePlus, FileText } from 'lucide-react';
import { motion } from 'motion/react';

import type { NoteWithAccess } from '@knowtis/api-client';
import { useNotes } from '@knowtis/data-access-notes';
import { Button, buttonVariants, cn } from '@knowtis/design-system';
import { formatRelativeTime } from '@knowtis/shared-util';

type GreetingKey =
  | 'welcome.goodMorning'
  | 'welcome.goodAfternoon'
  | 'welcome.goodEvening';

function getGreetingKey(): GreetingKey {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'welcome.goodMorning';
  }
  if (hour < 18) {
    return 'welcome.goodAfternoon';
  }
  return 'welcome.goodEvening';
}

export function WelcomePage() {
  const { t, i18n } = useTranslation(['common', 'notes']);
  const user = useAuthUser();
  const { data: notes, isLoading } = useNotes();
  const { createNote } = useCreateNoteAction();
  const firstName = user?.name?.split(' ')[0] ?? '';

  const recentNotes = useMemo(() => {
    if (!notes) {
      return [];
    }
    return [...notes]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 5);
  }, [notes]);

  const lastNote: NoteWithAccess | undefined = recentNotes[0];

  return (
    <div className="mx-auto max-w-xl py-6 md:py-12 px-4">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-[28px] md:text-3xl font-semibold tracking-tight text-(--foreground)"
      >
        {t(getGreetingKey())}
        {firstName ? `, ${firstName}` : ''}
      </motion.h1>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mt-6 flex gap-3"
      >
        <Button
          className="rounded-lg px-4 py-2.5 text-sm font-medium gap-2"
          onClick={createNote}
          onPointerDown={preloadEditorChunk}
        >
          <FilePlus className="h-4 w-4" />
          {t('welcome.newNote')}
        </Button>

        {lastNote && (
          <Link
            to={ROUTES.NOTE}
            params={{ noteId: lastNote.id }}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'rounded-lg px-4 py-2.5 text-sm font-medium max-w-[240px]'
            )}
          >
            <span className="truncate">
              {t('welcome.continue', { title: lastNote.title })}
            </span>
          </Link>
        )}
      </motion.div>

      {/* Recent notes */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mt-10"
      >
        <h2 className="text-xs font-medium text-(--muted-foreground)/50 uppercase tracking-wider mb-3">
          {t('welcome.recent')}
        </h2>

        {isLoading ? (
          <div className="space-y-0 divide-y divide-(--border)/50">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-3 animate-pulse"
              >
                <div className="h-4 w-40 bg-(--muted) rounded" />
                <div className="h-3 w-16 bg-(--muted) rounded" />
              </div>
            ))}
          </div>
        ) : recentNotes.length === 0 ? (
          <p className="text-sm text-(--muted-foreground)/70 py-3">
            {t('welcome.noRecentNotes')}
          </p>
        ) : (
          <div className="divide-y divide-(--border)/50">
            {recentNotes.map((note) => (
              <Link
                key={note.id}
                to={ROUTES.NOTE}
                params={{ noteId: note.id }}
                className={cn(
                  'flex items-center justify-between py-3 group',
                  'hover:bg-(--accent)/50 -mx-3 px-3 rounded-md transition-colors'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="h-4 w-4 text-(--muted-foreground)/60 shrink-0" />
                  <span className="text-sm font-medium truncate text-(--foreground) group-hover:text-(--primary) transition-colors">
                    {note.title}
                  </span>
                </div>
                <span className="text-xs text-(--muted-foreground)/50 shrink-0 ml-4">
                  {formatRelativeTime(note.updatedAt, i18n.language)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
