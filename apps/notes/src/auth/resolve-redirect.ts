const DEFAULT_REDIRECT = '/dashboard';

/**
 * Resolves the target URL after login. Falls back to the dashboard for anything
 * that is not a same-origin absolute path, so a caller-supplied `?redirect=`
 * cannot send the user off-site, and for `/login` itself to avoid a loop.
 */
export function resolvePostLoginRedirect(redirect?: string): string {
  if (!redirect || !isInternalPath(redirect) || redirect.includes('/login')) {
    return DEFAULT_REDIRECT;
  }
  return redirect;
}

function isInternalPath(redirect: string): boolean {
  return (
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.startsWith('/\\')
  );
}
