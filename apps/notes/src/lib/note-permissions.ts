import { ACCESS, type NoteAccessLevel } from '@knowtis/shared-types';

export type { NoteAccessLevel };
export type NoteAction = 'read' | 'update' | 'delete' | 'share';

export function canPerformNoteAction(
  accessLevel: NoteAccessLevel,
  action: NoteAction
): boolean {
  switch (accessLevel) {
    case ACCESS.OWNER:
      return true;
    case ACCESS.EDITOR:
      return action === 'read' || action === 'update';
    case ACCESS.VIEWER:
      return action === 'read';
    default:
      return false;
  }
}
