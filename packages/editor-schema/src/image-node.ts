import { mergeAttributes, Node } from '@tiptap/core';

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
    const dimensions: Record<string, unknown> = {};
    if (width) {
      dimensions['width'] = width;
    }
    if (height) {
      dimensions['height'] = height;
    }
    return [
      'figure',
      { [IMAGE_FIGURE_ATTRIBUTE]: '' },
      ['img', mergeAttributes({ src, alt }, dimensions)],
      ['figcaption', {}, 0],
    ];
  },
});
