/**
 * Resolves the target URL after login, preventing redirect loops.
 */
export function resolvePostLoginRedirect(redirect?: string): string {
  if (redirect && !redirect.includes('/login')) {
    return redirect;
  }
  return '/dashboard';
}
