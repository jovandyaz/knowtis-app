import { isIP } from 'node:net';

const REGISTRABLE_LABEL_COUNT = 2;
const MAX_LOGGED_HOST_LENGTH = 64;
const SUBDOMAIN_WILDCARD = '*.';
const HOST_WILDCARD = '*';
const IPV6_BRACKETS = /^\[|\]$/g;

/**
 * Reduces a URL hostname to what is safe to log. Subdomain labels can carry
 * exfiltrated data, so only the last two labels are kept and deeper ones fold
 * into `*.`; an IP address is kept whole. The URL parser enforces no label
 * length, so a result longer than 64 characters becomes `*`.
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
