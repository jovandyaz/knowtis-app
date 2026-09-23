import {
  defaultRehypePlugins,
  type AllowElement,
  type StreamdownProps,
} from 'streamdown';

import { isStoredImageUrl } from '@knowtis/shared-util';

const LINK_PROTOCOLS: ReadonlySet<string> = new Set(['https:', 'mailto:']);

function urlProperty(
  element: Parameters<AllowElement>[0],
  name: string
): string {
  const value = element.properties[name];
  return typeof value === 'string' ? value : '';
}

function isAllowedLink(href: string): boolean {
  try {
    return LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

const allowElement: AllowElement = (element) => {
  switch (element.tagName) {
    case 'img':
      return isStoredImageUrl(urlProperty(element, 'src'));
    case 'a':
      return isAllowedLink(urlProperty(element, 'href'));
    default:
      return true;
  }
};

export const UNTRUSTED_MARKDOWN_PROPS: Pick<
  StreamdownProps,
  'rehypePlugins' | 'allowElement' | 'unwrapDisallowed'
> = {
  rehypePlugins: [defaultRehypePlugins['sanitize']],
  allowElement,
  unwrapDisallowed: true,
};
