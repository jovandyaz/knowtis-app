import { KnowtisLogo } from '@/components/layout/KnowtisLogo';
import { format } from 'date-fns';

import {
  SharedNoteActions,
  type SharedNoteActionsProps,
} from './SharedNoteActions';
import { SharedNoteBadge } from './SharedNoteBadge';

interface SharedNoteHeaderProps extends SharedNoteActionsProps {
  ownerName: string;
  updatedAt: Date;
}

export function SharedNoteHeader({
  canEdit,
  ownerName,
  updatedAt,
  ...actions
}: SharedNoteHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border/30 bg-(--card)/50 px-4 py-3 md:h-12 md:border-b-0 md:bg-transparent md:px-3 md:py-0">
      <div className="flex h-full items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <KnowtisLogo className="h-5 w-auto text-primary" />
          <SharedNoteBadge canEdit={canEdit} />
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground/50 md:flex">
            <span>{ownerName}</span>
            <span>&middot;</span>
            <span>{format(updatedAt, 'MMM d, yyyy')}</span>
          </span>
        </div>
        <SharedNoteActions canEdit={canEdit} {...actions} />
      </div>
    </header>
  );
}
