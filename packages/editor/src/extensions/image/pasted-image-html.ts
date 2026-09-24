import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { IMAGE_FIGURE_ATTRIBUTE } from '@knowtis/editor-schema';
import {
  IMAGE_MIME_TYPES,
  logger,
  MAX_IMAGE_BYTES,
} from '@knowtis/shared-util';

const PASTED_IMAGE_SCHEMES: readonly string[] = ['http:', 'https:'];
export const PENDING_IMAGE_SCHEME = 'pending:';

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
const MAX_IMAGE_DIMENSION_PX = 10_000;
const DECIMAL_DIGITS = /^\d+$/;

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
  const type = IMAGE_MIME_TYPES.find(
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
  if (!file) {
    return null;
  }
  try {
    const token = onDataImage(file);
    return token.startsWith(PENDING_IMAGE_SCHEME) ? token : null;
  } catch (error) {
    logger.warn('Dropped a pasted image its data hook rejected', {
      context: 'PastedImages',
      error,
    });
    return null;
  }
}

function remoteImageUrl(src: string): string | null {
  try {
    const url = new URL(src);
    const allowedScheme = PASTED_IMAGE_SCHEMES.includes(url.protocol);
    const hasCredentials = url.username !== '' || url.password !== '';
    return allowedScheme && !hasCredentials ? url.href : null;
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
  const digits = value?.trim() ?? '';
  const parsed = DECIMAL_DIGITS.test(digits) ? Number(digits) : 0;
  return parsed > 0 && parsed <= MAX_IMAGE_DIMENSION_PX ? parsed : null;
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

function allowedImage(img: HTMLImageElement, src: string): HTMLImageElement {
  // The inert template's document, so setting the src fetches nothing.
  const image = img.ownerDocument.createElement('img');
  if (src !== '') {
    image.setAttribute('src', src);
  }
  image.setAttribute('alt', img.getAttribute('alt') ?? '');
  for (const name of DIMENSIONS) {
    const value = pixelDimension(img, name);
    if (value !== null) {
      image.setAttribute(name, String(value));
    }
  }
  return image;
}

function imageFigure(image: HTMLImageElement): HTMLElement {
  const figure = image.ownerDocument.createElement('figure');
  figure.setAttribute(IMAGE_FIGURE_ATTRIBUTE, '');
  figure.appendChild(image);
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
 * node (`figure[data-image]`), lifted out of its paragraph and stripped to its
 * src, alt and capped pixel size. `http(s)` srcs are kept, a `data:` image
 * becomes the `onDataImage` token or is dropped, and any other src removes the
 * image along with its image figure.
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
    const figure = img.closest(IMAGE_FIGURE_SELECTOR);
    const src = img.getAttribute('src') ?? '';
    // The schema renders no src for an image whose src is not stored, so a
    // figure copied from this editor may carry none; it pastes as it always has.
    const resolved = figure && src === '' ? src : resolveSrc(src, options);
    if (resolved === null) {
      (figure ?? img).remove();
    } else if (figure) {
      img.replaceWith(allowedImage(img, resolved));
    } else {
      replaceWithLiftedFigure(img, imageFigure(allowedImage(img, resolved)));
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
