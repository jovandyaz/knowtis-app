import { ROUTES } from '@/config';

/**
 * Navigates to login with a full page reload — required (not an SPA nav) to clear
 * the in-memory copilot/AI stores and agent socket so the prior account can't leak.
 */
export function redirectToLoginWithReload(): void {
  window.location.assign(ROUTES.LOGIN);
}
