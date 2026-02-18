import { RoleManager } from '@jovandyaz/permissions-core';

import type { AppAbility } from './types';
import { SUBJECTS } from './types';

const { Note } = SUBJECTS;

export const ROLES = {
  ANONYMOUS: 'anonymous',
  USER: 'user',
  NOTE_OWNER: 'note:owner',
  NOTE_EDITOR: 'note:editor',
  NOTE_VIEWER: 'note:viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const appRoleManager = new RoleManager<AppAbility>({
  resolveSubject: (obj) => obj.__typename,
  roles: {
    [ROLES.ANONYMOUS]: (allow) => {
      allow('read', Note, { isPublic: true });
    },
    [ROLES.USER]: (allow) => {
      allow('create', Note);
      allow('read', Note, { isPublic: true });
    },
    [ROLES.NOTE_OWNER]: (allow) => {
      allow('manage', Note);
    },
    [ROLES.NOTE_EDITOR]: (allow) => {
      allow('read', Note);
      allow('update', Note);
    },
    [ROLES.NOTE_VIEWER]: (allow) => {
      allow('read', Note);
    },
  },
});
