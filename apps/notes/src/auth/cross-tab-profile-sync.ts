import type {
  AuthUserProfile,
  VerifiedUserBroadcast,
} from '@jovandyaz/auth-react';

export interface CrossTabProfileSyncDeps {
  user: AuthUserProfile | null;
  invalidateProfile: () => void;
}

/**
 * Reacts to another tab persisting a verified user. Only the tab that still
 * believes this same account is unverified refetches: once its own store is
 * verified, the echo of its own write is ignored, so tabs never ping-pong.
 */
export function syncVerifiedUserFromOtherTab(
  verified: VerifiedUserBroadcast,
  deps: CrossTabProfileSyncDeps
): void {
  const { user, invalidateProfile } = deps;
  if (user?.id !== verified.id || user.emailVerifiedAt) {
    return;
  }
  invalidateProfile();
}
