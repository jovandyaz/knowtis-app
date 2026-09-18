import { ACCESS, type NoteAccessLevel } from '@knowtis/shared-types';

export type { NoteAccessLevel };
export type NoteAction = 'read' | 'update' | 'delete' | 'share';

interface NoteActionContext {
  editorsCanShare?: boolean;
}

/** `labelKey` belongs to the `notes` namespace, beside the share dialog copy. */
export const ACCESS_BADGE_CONFIG = {
  owner: { labelKey: 'share.owner', variant: 'default' },
  editor: { labelKey: 'share.editor', variant: 'secondary' },
  viewer: { labelKey: 'share.viewer', variant: 'outline' },
} as const satisfies Record<
  NoteAccessLevel,
  { labelKey: string; variant: 'default' | 'secondary' | 'outline' }
>;

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
