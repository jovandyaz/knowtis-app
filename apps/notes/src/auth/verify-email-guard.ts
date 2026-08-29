import { redirect } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useVerifyEmailStore } from '@/stores/verify-email.store';

import { authStore } from './setup';

export interface VerifyEmailSearch {
  token?: string;
}

export function parseVerifyEmailSearch(
  search: Record<string, unknown>
): VerifyEmailSearch {
  if (typeof search.token === 'string') {
    return { token: search.token };
  }
  return {};
}

/**
 * Lets the link through for a visitor with no account session of their own,
 * and hands a signed-in account the in-app code dialog instead.
 */
export function guardVerifyEmailRoute({
  search,
}: {
  search: VerifyEmailSearch;
}): void {
  const { isAuthenticated, user } = authStore.getState();
  if (!isAuthenticated || user?.isAnonymous) {
    return;
  }

  // Redeeming the token revokes every session of its owner, including the one
  // reading this, so the click is answered with the code from the same email
  // instead. Redirecting out of beforeLoad resolves the pending navigation, so
  // the token is never committed as a history entry.
  if (search.token) {
    useVerifyEmailStore.getState().open('emailLink');
  }

  // The app root opens a fresh note whose editor would take the focus this
  // dialog needs, so the dashboard is where the code gets typed.
  throw redirect({ to: ROUTES.DASHBOARD });
}
