import { USER_ROLE } from '@jovandyaz/auth';
import { definePermissions } from '@jovandyaz/permissions-core';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

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
        allow('read', Note, { generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK });
        return;
      }

      // Admin: full access to all notes
      if (user.role === USER_ROLE.ADMIN) {
        allow('manage', Note);
        return;
      }

      if (user.isAnonymous) {
        // Anonymous authenticated users: CRUD own notes, no sharing
        allow('create', Note);
        allow('read', Note, { ownerId: user.id });
        allow('update', Note, { ownerId: user.id });
        allow('delete', Note, { ownerId: user.id });
        allow('read', Note, { generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK });
        return;
      }

      // Registered users: full access
      allow('manage', Note, { ownerId: user.id });

      allow('read', Note, { generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK });

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
