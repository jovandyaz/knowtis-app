const MAC_USER_AGENT_PATTERN = /Mac/i;

/** Defaults to the running browser's user agent; false outside a browser. */
export function isMacPlatform(userAgent?: string): boolean {
  const agent =
    userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return MAC_USER_AGENT_PATTERN.test(agent);
}
