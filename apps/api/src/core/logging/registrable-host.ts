import { isIP } from 'node:net';

const REGISTRABLE_LABEL_COUNT = 2;
const MAX_LOGGED_HOST_LENGTH = 64;
const SUBDOMAIN_WILDCARD = '*.';
const HOST_WILDCARD = '*';
const IPV6_BRACKETS = /^\[|\]$/g;

/**
 * Reduces a hostname to what is safe to log, since subdomain labels can carry
 * data: the last two labels, deeper ones folded into `*.`, an IP whole, and
 * `*` past 64 characters (the URL parser caps no label length).
 */
export function registrableHostOf(hostname: string): string {
  const labels =
    isIP(hostname.replace(IPV6_BRACKETS, '')) !== 0
      ? [hostname]
      : hostname.split('.');
  const registrable = labels.slice(-REGISTRABLE_LABEL_COUNT).join('.');
  if (registrable.length > MAX_LOGGED_HOST_LENGTH) {
    return HOST_WILDCARD;
  }
  return labels.length > REGISTRABLE_LABEL_COUNT
    ? `${SUBDOMAIN_WILDCARD}${registrable}`
    : registrable;
}
