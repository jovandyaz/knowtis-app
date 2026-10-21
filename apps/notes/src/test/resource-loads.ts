import { isStoredImageUrl } from '@knowtis/shared-util';

/** One fetch, navigation or inline handler the browser would act on without a user gesture. */
export interface ResourceLoad {
  /** The element, attribute or API that carries it, e.g. `img[src]` or `fetch`. */
  readonly via: string;
  readonly url: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAGMENT_PREFIX = '#';
const REPLACEMENT_CODE_POINT = 0xfffd;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_MIN = 0xd800;
const SURROGATE_MAX = 0xdfff;

const IMG = 'img';
const VIDEO = 'video';
const SOURCE = 'source';
const PICTURE = 'picture';

const SELF_LOADING_ELEMENTS = new Set([
  'iframe',
  'frame',
  'object',
  'embed',
  'portal',
  'applet',
]);
const SRC_LOADING_ELEMENTS = new Set([IMG, VIDEO, 'audio', 'track']);
const MEDIA_SOURCE_PARENTS = new Set([VIDEO, 'audio']);
const CSS_VALUED_ATTRIBUTES = new Set([
  'style',
  'fill',
  'stroke',
  'filter',
  'mask',
  'clip-path',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'cursor',
]);
const SVG_REFERENCE_ATTRIBUTES = ['href', 'xlink:href'];
const SMIL_ELEMENTS = new Set([
  'set',
  'animate',
  'animatemotion',
  'animatetransform',
  'animatecolor',
]);
const SMIL_VALUE_ATTRIBUTES = ['to', 'from', 'values', 'by'];
// an inline handler such as onload or onerror runs code the moment its event
// fires, which can fetch anything; the recorder counts it as a load
const EVENT_HANDLER_PREFIX = 'on';
const REFRESH_URL = /url\s*=\s*['"]?([^'"\s;]+)/i;

const CSS_ESCAPE = /\\(?:([\da-f]{1,6})\s?|([\s\S]))/gi;
const CSS_URL = /\burl\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi;
const CSS_STRING_FUNCTION =
  /\b(?:image-set|image|src)\(\s*(['"])([\s\S]*?)\1/gi;
const CSS_IMPORT = /@import\s+(['"])([\s\S]*?)\1/gi;

function cssEscapeCodePoint(hex: string): number {
  const codePoint = parseInt(hex, 16);
  const replaced =
    codePoint === 0 ||
    codePoint > MAX_CODE_POINT ||
    (codePoint >= SURROGATE_MIN && codePoint <= SURROGATE_MAX);
  return replaced ? REPLACEMENT_CODE_POINT : codePoint;
}

function decodeCssEscapes(css: string): string {
  return css.replace(CSS_ESCAPE, (_, hex: string | undefined, char: string) =>
    hex === undefined ? char : String.fromCodePoint(cssEscapeCodePoint(hex))
  );
}

function cssTargets(css: string): string[] {
  const decoded = decodeCssEscapes(css);
  return [CSS_URL, CSS_STRING_FUNCTION, CSS_IMPORT]
    .flatMap((pattern) =>
      [...decoded.matchAll(pattern)].map(([, , url]) => url)
    )
    .map((url) => (url ?? '').trim())
    .filter((url) => url !== '' && !url.startsWith(FRAGMENT_PREFIX));
}

function srcsetUrls(srcset: string): string[] {
  return srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .filter((url) => url !== '');
}

// a <source> loads only where it can be selected: beside an <img> child of a
// <picture>, or inside a media element
function sourceIsSelectable(element: Element): boolean {
  const parent = element.parentElement;
  if (!parent) {
    return false;
  }
  const parentName = parent.localName.toLowerCase();
  return parentName === PICTURE
    ? [...parent.children].some((child) => child.localName === IMG)
    : MEDIA_SOURCE_PARENTS.has(parentName);
}

function attributeLoad(element: Element, name: string): ResourceLoad[] {
  const url = element.getAttribute(name)?.trim() ?? '';
  return url === ''
    ? []
    : [{ via: `${element.localName.toLowerCase()}[${name}]`, url }];
}

function cssLoads(css: string, via: string): ResourceLoad[] {
  return cssTargets(css).map((url) => ({ via, url }));
}

/** The loads one element starts by itself: its own attributes and, for `<style>`, its text. */
export function resourceLoadsOf(element: Element): ResourceLoad[] {
  const tag = element.localName.toLowerCase();
  const attr = (name: string) => element.getAttribute(name);
  const selectableSource = tag === SOURCE && sourceIsSelectable(element);
  const loads: ResourceLoad[] = [];

  if (SELF_LOADING_ELEMENTS.has(tag)) {
    loads.push({ via: `<${tag}>`, url: attr('src') ?? attr('data') ?? '' });
  }
  if (tag === 'link' || tag === 'base') {
    loads.push(...attributeLoad(element, 'href'));
  }
  if (
    tag === 'meta' &&
    attr('http-equiv')?.trim().toLowerCase() === 'refresh'
  ) {
    loads.push({
      via: '<meta http-equiv=refresh>',
      url: REFRESH_URL.exec(attr('content') ?? '')?.[1] ?? '',
    });
  }
  if (
    tag === 'script' ||
    SRC_LOADING_ELEMENTS.has(tag) ||
    (tag === 'input' && attr('type')?.toLowerCase() === 'image') ||
    selectableSource
  ) {
    loads.push(...attributeLoad(element, 'src'));
  }
  if (tag === IMG || selectableSource) {
    loads.push(
      ...srcsetUrls(attr('srcset') ?? '').map((url) => ({
        via: `${tag}[srcset]`,
        url,
      }))
    );
  }
  if (tag === VIDEO) {
    loads.push(...attributeLoad(element, 'poster'));
  }
  loads.push(...attributeLoad(element, 'background'));

  if (element.namespaceURI === SVG_NS && tag !== 'a') {
    loads.push(
      ...SVG_REFERENCE_ATTRIBUTES.flatMap((name) =>
        attributeLoad(element, name)
      ).filter(({ url }) => !url.startsWith(FRAGMENT_PREFIX))
    );
  }
  if (
    SMIL_ELEMENTS.has(tag) &&
    SVG_REFERENCE_ATTRIBUTES.includes(attr('attributeName') ?? '')
  ) {
    loads.push(
      ...SMIL_VALUE_ATTRIBUTES.flatMap((name) => attributeLoad(element, name))
    );
  }

  for (const { name, value } of [...element.attributes]) {
    const attribute = name.toLowerCase();
    if (CSS_VALUED_ATTRIBUTES.has(attribute)) {
      loads.push(...cssLoads(value, `${tag}[${name}]`));
    }
    if (attribute.startsWith(EVENT_HANDLER_PREFIX)) {
      loads.push({ via: `${tag}[${name}]`, url: value });
    }
  }
  if (tag === 'style') {
    loads.push(...cssLoads(element.textContent ?? '', '<style>'));
  }
  return loads;
}

/** Every load `root` and its descendants would start once attached to a page. */
export function resourceLoadsIn(root: Element): ResourceLoad[] {
  return [root, ...root.querySelectorAll('*')].flatMap(resourceLoadsOf);
}

/** Loads other than an image the app's blob store serves, which every surface may show. */
export function foreignLoads(loads: readonly ResourceLoad[]): ResourceLoad[] {
  return loads.filter((load) => !isStoredImageUrl(load.url));
}

type Restore = () => void;

function patchSetter(
  prototype: object,
  name: string,
  onSet: (value: unknown) => void
): Restore {
  const original = Object.getOwnPropertyDescriptor(prototype, name);
  const set = original?.set;
  if (!original || !set) {
    throw new Error(`Cannot record writes to ${name}: it has no setter`);
  }
  Object.defineProperty(prototype, name, {
    ...original,
    set(this: object, value: unknown) {
      onSet(value);
      set.call(this, value);
    },
  });
  return () => Object.defineProperty(prototype, name, original);
}

function patchMethod<T extends object, K extends keyof T>(
  target: T,
  name: K,
  replacement: (original: T[K]) => T[K]
): Restore {
  const original = target[name];
  target[name] = replacement(original);
  return () => {
    target[name] = original;
  };
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

/**
 * Records every load and navigation the page starts while `action` runs:
 * elements and attributes attached to the document (even ones detached again
 * before `action` settles, as Mermaid's measuring pass does), images built
 * off-document with `new Image()`, `fetch`, `XMLHttpRequest`, `sendBeacon` and
 * `window.open`. jsdom fetches nothing, so the markup is the evidence: each
 * entry is a request a browser would send.
 */
export async function recordResourceLoads(
  action: () => Promise<void> | void
): Promise<ResourceLoad[]> {
  const seen = new Map<string, ResourceLoad>();
  const add = (load: ResourceLoad) => seen.set(`${load.via} ${load.url}`, load);
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      const owner =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      if (owner) {
        resourceLoadsOf(owner).forEach(add);
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          resourceLoadsIn(node).forEach(add);
        }
      }
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  const restores: Restore[] = [
    patchSetter(HTMLImageElement.prototype, 'src', (value) => {
      const url = String(value).trim();
      if (url !== '') {
        add({ via: 'img[src]', url });
      }
    }),
    patchSetter(HTMLImageElement.prototype, 'srcset', (value) =>
      srcsetUrls(String(value)).forEach((url) =>
        add({ via: 'img[srcset]', url })
      )
    ),
    patchMethod(
      globalThis,
      'fetch',
      (original) =>
        (...args: Parameters<typeof fetch>) => {
          add({ via: 'fetch', url: requestUrl(args[0]) });
          return original(...args);
        }
    ),
    patchMethod(
      XMLHttpRequest.prototype,
      'open',
      (original) =>
        function (
          this: XMLHttpRequest,
          method: string,
          url: string | URL,
          ...rest: unknown[]
        ) {
          add({ via: 'XMLHttpRequest', url: String(url) });
          Reflect.apply(original, this, [method, url, ...rest]);
        }
    ),
    patchMethod(window, 'open', () => (url?: string | URL) => {
      add({ via: 'window.open', url: String(url ?? '') });
      return null;
    }),
  ];
  if (typeof navigator.sendBeacon === 'function') {
    restores.push(
      patchMethod(navigator, 'sendBeacon', () => (url: string | URL) => {
        add({ via: 'sendBeacon', url: String(url) });
        return false;
      })
    );
  }

  try {
    await action();
  } finally {
    collect(observer.takeRecords());
    observer.disconnect();
    resourceLoadsIn(document.documentElement).forEach(add);
    for (const restore of restores.toReversed()) {
      restore();
    }
  }
  return [...seen.values()];
}
