import { ROUTES } from '@/config';

/**
 * Hard-navigates to the login route, forcing a full page reload.
 *
 * Logout MUST cross the session boundary with a reload, not an SPA navigation:
 * the copilot/AI Zustand stores and the agent WebSocket are module-level
 * singletons that survive a soft navigation, so a soft logout leaks the previous
 * account's conversation (and its authenticated socket) into the next session.
 */
export function redirectToLoginWithReload(): void {
  window.location.assign(ROUTES.LOGIN);
}
