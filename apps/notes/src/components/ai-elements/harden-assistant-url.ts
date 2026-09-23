import { defaultUrlTransform, type UrlTransform } from 'streamdown';

import { isStoredImageUrl } from '@knowtis/shared-util';

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

function schemeOf(url: string): string | null {
  const colon = url.indexOf(':');
  if (colon < 0) {
    return null;
  }
  const boundary = /[/?#]/.exec(url);
  if (boundary != null && boundary.index < colon) {
    return null;
  }
  return url.slice(0, colon).toLowerCase();
}

/** Assistant output is untrusted (injectable via shared notes). Image `src` keeps
 * only the app's own blob store: any other source auto-fires a GET on render, and a
 * relative one resolves to the app origin, whose `/t/*` proxies to analytics. Links
 * allow only schemes Streamdown won't strip. */
export const hardenAssistantUrl: UrlTransform = (url, key, node) => {
  const sanitized = defaultUrlTransform(url, key, node);
  if (sanitized == null || sanitized === '') {
    return sanitized;
  }
  if (key === 'src') {
    return isStoredImageUrl(sanitized) ? sanitized : '';
  }
  const scheme = schemeOf(sanitized);
  return scheme == null || SAFE_LINK_SCHEMES.has(scheme) ? sanitized : '';
};
