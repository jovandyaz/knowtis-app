import { definePermissions } from '@jovandyaz/permissions';

import { PERMISSION } from '@knowtis/shared-types';

import {
  SUBJECTS,
  type AppAbility,
  type AuthUser,
  type PermissionContext,
} from './types';

const { Note } = SUBJECTS;

export function defineAbilityFor(
  user: AuthUser | null,
  context: PermissionContext = {}
): AppAbility {
  return definePermissions<AppAbility>(
    (allow) => {
      if (!user) {
        allow('read', Note, { isPublic: true });
        return;
      }

      allow('manage', Note, { ownerId: user.id });

      allow('read', Note, { isPublic: true });

      for (const shared of context.sharedNotes ?? []) {
        if (shared.permission === PERMISSION.EDITOR) {
          allow('read', Note, { id: shared.noteId });
          allow('update', Note, { id: shared.noteId });
        } else if (shared.permission === PERMISSION.VIEWER) {
          allow('read', Note, { id: shared.noteId });
        }
      }
    },
    { resolveSubject: (obj) => obj.__typename }
  );
}
