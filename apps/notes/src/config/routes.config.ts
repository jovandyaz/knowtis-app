import type { FileRouteTypes } from '../routeTree.gen';

type AppRoute = FileRouteTypes['to'];

export const ROUTES = {
  ROOT: '/',
  DASHBOARD: '/dashboard',
  NOTES: '/notes',
  NOTE: '/notes/$noteId',
  SHARED_NOTE: '/s/$token',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
} as const satisfies Record<string, AppRoute>;

const SHARE_TOKEN_PARAM = '$token';

/**
 * Concrete path for a note's share link. The replacement is passed as a
 * function so a token containing `$&`, `$'` or `` $` `` is inserted verbatim
 * instead of being expanded as a String.replace substitution pattern.
 */
export function sharedNotePath(token: string): string {
  return ROUTES.SHARED_NOTE.replace(SHARE_TOKEN_PARAM, () =>
    encodeURIComponent(token)
  );
}
