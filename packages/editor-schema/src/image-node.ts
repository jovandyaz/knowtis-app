import { Node } from '@tiptap/core';

import { isStoredImageUrl } from '@knowtis/shared-util';

export const IMAGE_NODE_NAME = 'image' as const;
export const IMAGE_FIGURE_ATTRIBUTE = 'data-image';

export interface ImageAttributes {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

const IMAGE_FIGURE_TAG = `figure[${IMAGE_FIGURE_ATTRIBUTE}]`;

function dimension(value: string | null): number | null {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const ImageNode = Node.create({
  name: IMAGE_NODE_NAME,
  group: 'block',
  content: 'inline*',
  draggable: false,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: IMAGE_FIGURE_TAG,
        getAttrs: (node) => {
          const img = (node as HTMLElement).querySelector('img');
          if (!img) {
            return false;
          }
          return {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            width: dimension(img.getAttribute('width')),
            height: dimension(img.getAttribute('height')),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, width, height } = HTMLAttributes as Record<
      string,
      unknown
    >;
    // Every serialization (getHTML, clipboard, the server's `content`, the
    // proposal diff's deleted slices) runs through here, so a foreign src never
    // reaches a page; the figure stays, so a re-parse keeps the node.
    const image: Record<string, unknown> =
      typeof src === 'string' && isStoredImageUrl(src) ? { src, alt } : { alt };
    if (width) {
      image['width'] = width;
    }
    if (height) {
      image['height'] = height;
    }
    return [
      'figure',
      { [IMAGE_FIGURE_ATTRIBUTE]: '' },
      ['img', image],
      ['figcaption', {}, 0],
    ];
  },
});
