import { KnowtisLogo } from '@/components/layout/KnowtisLogo';
import { format } from 'date-fns';

import {
  SharedNoteActions,
  type SharedNoteActionsProps,
} from './SharedNoteActions';
import { SharedNoteBadge } from './SharedNoteBadge';

interface SharedNoteHeaderProps extends Omit<
  SharedNoteActionsProps,
  'variant' | 'canEdit'
> {
  canEdit: boolean;
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
    <>
      <header className="md:hidden shrink-0 border-b border-border/30 bg-(--card)/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KnowtisLogo className="h-5 w-auto text-primary" />
            <SharedNoteBadge canEdit={canEdit} />
          </div>
          <SharedNoteActions variant="mobile" canEdit={canEdit} {...actions} />
        </div>
      </header>

      <div className="hidden md:flex items-center justify-between h-12 shrink-0 px-3">
        <div className="flex items-center gap-3">
          <KnowtisLogo className="h-5 w-auto text-primary" />
          <SharedNoteBadge canEdit={canEdit} />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <span>{ownerName}</span>
            <span>&middot;</span>
            <span>{format(new Date(updatedAt), 'MMM d, yyyy')}</span>
          </span>
        </div>
        <SharedNoteActions variant="desktop" canEdit={canEdit} {...actions} />
      </div>
    </>
  );
}
