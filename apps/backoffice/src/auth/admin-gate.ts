import { USER_ROLE } from '@jovandyaz/auth';
import type { AuthUserProfile } from '@jovandyaz/auth-react';

export type AdminAccess = 'allowed' | 'unauthenticated' | 'forbidden';

interface AdminGateState {
  isAuthenticated: boolean;
  user: AuthUserProfile | null;
}

export function resolveAdminAccess(state: AdminGateState): AdminAccess {
  if (!state.isAuthenticated || !state.user) {
    return 'unauthenticated';
  }
  return state.user.role === USER_ROLE.ADMIN ? 'allowed' : 'forbidden';
}
