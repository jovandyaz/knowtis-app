import { defaultUrlTransform, type UrlTransform } from 'streamdown';

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const INERT_IMAGE_SCHEMES = new Set(['data', 'blob']);

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

/** Assistant output is untrusted (injectable via shared notes). Image `src` is
 * allowlisted (relative/data/blob) because even `https:/host` resolves remote and
 * auto-fires an exfiltration GET; links allow only schemes Streamdown won't strip. */
export const hardenAssistantUrl: UrlTransform = (url, key, node) => {
  const sanitized = defaultUrlTransform(url, key, node);
  if (sanitized == null || sanitized === '') {
    return sanitized;
  }
  const scheme = schemeOf(sanitized);
  if (key === 'src') {
    const isRelative = scheme === null && !sanitized.startsWith('//');
    const isInert = scheme != null && INERT_IMAGE_SCHEMES.has(scheme);
    return isRelative || isInert ? sanitized : '';
  }
  return scheme == null || SAFE_LINK_SCHEMES.has(scheme) ? sanitized : '';
};
