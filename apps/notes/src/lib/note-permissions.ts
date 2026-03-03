import { ACCESS, type NoteAccessLevel } from '@knowtis/shared-types';

export type { NoteAccessLevel };
export type NoteAction = 'read' | 'update' | 'delete' | 'share';

interface NoteActionContext {
  editorsCanShare?: boolean;
}

export const ACCESS_BADGE_CONFIG: Record<
  NoteAccessLevel,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  owner: { label: 'Owner', variant: 'default' },
  editor: { label: 'Editor', variant: 'secondary' },
  viewer: { label: 'Viewer', variant: 'outline' },
};

export function canPerformNoteAction(
  accessLevel: NoteAccessLevel,
  action: NoteAction,
  context?: NoteActionContext
): boolean {
  switch (accessLevel) {
    case ACCESS.OWNER:
      return true;
    case ACCESS.EDITOR:
      if (action === 'share') {
        return context?.editorsCanShare === true;
      }
      return action === 'read' || action === 'update';
    case ACCESS.VIEWER:
      return action === 'read';
    default:
      return false;
  }
}
