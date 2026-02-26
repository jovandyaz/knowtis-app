import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import {
  ACCESS_BADGE_CONFIG,
  canPerformNoteAction,
  createPreview,
  formatNoteDate,
} from '@/lib';
import { Clock, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

import type { NoteWithAccess } from '@knowtis/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';
import { ACCESS, type NoteAccessLevel } from '@knowtis/shared-types';

/**
 * Note card props interface
 */
interface NoteCardProps {
  note: NoteWithAccess;
  onDelete: (id: string) => void;
}

export const NoteCard = memo(function NoteCard({
  note,
  onDelete,
}: NoteCardProps) {
  const { t } = useTranslation('notes');
  const contentPreview = createPreview(note.content);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="group relative h-full overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        <Link
          to="/notes/$noteId"
          params={{ noteId: note.id }}
          className="flex h-full flex-col"
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="line-clamp-1 text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                {note.title}
              </CardTitle>
              {note.accessLevel !== ACCESS.OWNER && (
                <Badge
                  variant={
                    ACCESS_BADGE_CONFIG[note.accessLevel as NoteAccessLevel]
                      .variant
                  }
                  className="shrink-0 text-[10px] px-1.5 py-0"
                >
                  {
                    ACCESS_BADGE_CONFIG[note.accessLevel as NoteAccessLevel]
                      .label
                  }
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between">
            <p className="line-clamp-3 text-sm text-muted-foreground leading-relaxed">
              {contentPreview || t('list.noContentYet')}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatNoteDate(note.updatedAt)}</span>
              </div>
            </div>
          </CardContent>
        </Link>

        {canPerformNoteAction(note.accessLevel, 'delete') && (
          <div className="absolute right-2 top-2 flex gap-1 opacity-100 md:opacity-0 transition-opacity duration-200 md:group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:h-8 md:w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(note.id);
              }}
              aria-label={t('delete.ariaLabel', { title: note.title })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
});
