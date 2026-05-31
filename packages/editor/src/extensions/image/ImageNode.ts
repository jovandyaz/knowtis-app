import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ImageView } from './ImageView';

export interface ImageAttributes {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (attrs: {
        src: string;
        alt?: string;
        width?: number | null;
        height?: number | null;
      }) => ReturnType;
    };
  }
}

export const ImageNode = Node.create({
  name: 'image',
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
        tag: 'figure[data-image]',
        getAttrs: (node) => {
          const img = (node as HTMLElement).querySelector('img');
          if (!img) {
            return false;
          }
          const w = img.getAttribute('width');
          const h = img.getAttribute('height');
          return {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            width: w ? Number(w) : null,
            height: h ? Number(h) : null,
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
      { 'data-image': '' },
      ['img', mergeAttributes({ src, alt }, dimensions)],
      ['figcaption', {}, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              alt: attrs.alt ?? '',
              width: attrs.width ?? null,
              height: attrs.height ?? null,
            },
          }),
    };
  },
});
