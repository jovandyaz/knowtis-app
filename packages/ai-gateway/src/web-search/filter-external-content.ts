import { detectPromptInjection } from '../guard/prompt-guard';
import type { WebSearchHit } from './web-search.types';

export interface SafeExternalSource {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase();

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0 || a === 10 || a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    return false;
  }

  if (host.includes(':')) {
    if (host === '::1' || host === '::') {
      return true;
    }
    // WHATWG URL normalizes ::ffff:a.b.c.d to hex (::ffff:c0a8:101), so the
    // embedded IPv4 is unrecoverable by string match — block all mapped literals.
    if (host.startsWith('::ffff:')) {
      return true;
    }
    if (
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return true;
    }
  }
  return false;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return !isPrivateOrLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

export function filterExternalHits(
  hits: readonly WebSearchHit[],
  opts: { readonly maxHits: number; readonly maxChars: number }
): SafeExternalSource[] {
  return hits
    .filter(
      (h) =>
        isHttpUrl(h.url) &&
        detectPromptInjection(h.title).safe &&
        detectPromptInjection(h.content).safe
    )
    .slice(0, opts.maxHits)
    .map((h) => ({
      title: h.title,
      url: h.url,
      snippet: h.content.slice(0, opts.maxChars),
    }));
}
