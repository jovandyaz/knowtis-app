import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { IMAGE_FIGURE_ATTRIBUTE } from '@knowtis/editor-schema';

import { ACCEPTED_IMAGE_TYPES } from './image-upload';

export const PASTED_IMAGE_SCHEMES = ['http:', 'https:'] as const;
export const PENDING_IMAGE_SCHEME = 'pending:';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BASE64_CHARS_PER_GROUP = 4;
const BYTES_PER_BASE64_GROUP = 3;
const DATA_URL_PREFIX_ALLOWANCE = 64;

/** Longest `data:` src decoded on paste; a longer one is dropped unread. */
export const MAX_DATA_IMAGE_CHARS =
  Math.ceil(
    (MAX_IMAGE_BYTES * BASE64_CHARS_PER_GROUP) / BYTES_PER_BASE64_GROUP
  ) + DATA_URL_PREFIX_ALLOWANCE;

const DATA_SCHEME = 'data:';
const BASE64_MARKER = ';base64';
const PASTED_IMAGE_FILE_NAME = 'pasted-image';
const IMAGE_FIGURE_SELECTOR = `figure[${IMAGE_FIGURE_ATTRIBUTE}]`;
const PARAGRAPH_SELECTOR = 'p';
const DIMENSIONS = ['width', 'height'] as const;
const PX_SUFFIX = 'px';

export type DataImageHandler = (file: File) => string;

export interface PastedImageOptions {
  /**
   * Receives the decoded bytes of a pasted `data:` image and returns the
   * `pending:` token stored as its src. Without it, `data:` images are dropped.
   */
  onDataImage?: DataImageHandler;
}

function decodeDataImage(src: string): File | null {
  const comma = src.indexOf(',');
  if (src.length > MAX_DATA_IMAGE_CHARS || comma < 0) {
    return null;
  }
  const header = src.slice(DATA_SCHEME.length, comma).toLowerCase();
  const type = ACCEPTED_IMAGE_TYPES.find(
    (accepted) => header === `${accepted}${BASE64_MARKER}`
  );
  if (!type) {
    return null;
  }
  let binary: string;
  try {
    binary = atob(src.slice(comma + 1));
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const extension = type.slice(type.indexOf('/') + 1);
  return new File([bytes], `${PASTED_IMAGE_FILE_NAME}.${extension}`, { type });
}

function dataImageToken(
  src: string,
  onDataImage: DataImageHandler | undefined
): string | null {
  if (!onDataImage) {
    return null;
  }
  const file = decodeDataImage(src);
  const token = file ? onDataImage(file) : null;
  return token?.startsWith(PENDING_IMAGE_SCHEME) ? token : null;
}

function remoteImageUrl(src: string): string | null {
  try {
    const url = new URL(src);
    return (PASTED_IMAGE_SCHEMES as readonly string[]).includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function resolveSrc(raw: string, options: PastedImageOptions): string | null {
  const src = raw.trim();
  return src.slice(0, DATA_SCHEME.length).toLowerCase() === DATA_SCHEME
    ? dataImageToken(src, options.onDataImage)
    : remoteImageUrl(src);
}

function positiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pixelDimension(
  img: HTMLImageElement,
  name: (typeof DIMENSIONS)[number]
): number | null {
  const style = img.style.getPropertyValue(name);
  return (
    positiveInteger(img.getAttribute(name)) ??
    (style.endsWith(PX_SUFFIX)
      ? positiveInteger(style.slice(0, -PX_SUFFIX.length))
      : null)
  );
}

function imageFigure(img: HTMLImageElement, src: string): HTMLElement {
  // The inert template's document, so setting the src fetches nothing.
  const doc = img.ownerDocument;
  const figure = doc.createElement('figure');
  figure.setAttribute(IMAGE_FIGURE_ATTRIBUTE, '');
  const image = figure.appendChild(doc.createElement('img'));
  image.setAttribute('src', src);
  image.setAttribute('alt', img.getAttribute('alt') ?? '');
  for (const name of DIMENSIONS) {
    const value = pixelDimension(img, name);
    if (value !== null) {
      image.setAttribute(name, String(value));
    }
  }
  return figure;
}

function unlessBlank(fragment: DocumentFragment): DocumentFragment[] {
  const blank =
    (fragment.textContent ?? '').trim() === '' &&
    !fragment.querySelector('img');
  return blank ? [] : [fragment];
}

// A figure left inside a <p> does not survive the re-parse of the returned
// HTML: the parser closes the <p> and adds an empty one after the figure.
function replaceWithLiftedFigure(
  img: HTMLImageElement,
  figure: HTMLElement
): void {
  const paragraph = img.closest(PARAGRAPH_SELECTOR);
  if (!paragraph) {
    img.replaceWith(figure);
    return;
  }
  const range = img.ownerDocument.createRange();
  range.setStartBefore(paragraph);
  range.setEndBefore(img);
  const head = range.extractContents();
  range.setStartAfter(img);
  range.setEndAfter(paragraph);
  const tail = range.extractContents();
  paragraph.replaceWith(...unlessBlank(head), figure, ...unlessBlank(tail));
}

/**
 * Rewrites pasted HTML so every allowed `<img>` parses as the editor's image
 * node (`figure[data-image]`), lifted out of its paragraph. `http(s)` srcs are
 * kept, a `data:` image becomes the `onDataImage` token or is dropped, and any
 * other src is removed.
 */
export function wrapPastedImages(
  html: string,
  options: PastedImageOptions = {}
): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const images = Array.from(template.content.querySelectorAll('img'));
  if (images.length === 0) {
    return html;
  }
  for (const img of images) {
    const inFigure = img.closest(IMAGE_FIGURE_SELECTOR) !== null;
    const src = img.getAttribute('src') ?? '';
    // The schema renders no src for an image whose src is not stored, so a
    // figure copied from this editor may carry none; it pastes as it always has.
    if (inFigure && src === '') {
      continue;
    }
    const resolved = resolveSrc(src, options);
    if (resolved === null) {
      img.remove();
    } else if (inFigure) {
      img.setAttribute('src', resolved);
    } else {
      replaceWithLiftedFigure(img, imageFigure(img, resolved));
    }
  }
  return template.innerHTML;
}

export const PastedImages = Extension.create<PastedImageOptions>({
  name: 'pastedImages',

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey('pastedImages'),
        props: {
          transformPastedHTML: (html) => wrapPastedImages(html, options),
        },
      }),
    ];
  },
});
