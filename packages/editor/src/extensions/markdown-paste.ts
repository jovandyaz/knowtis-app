import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { markdownToHtml } from '@knowtis/note-markdown';

import { IMAGE_INSERT_META } from './image/image-import';
import {
  wrapPastedImages,
  type PastedImageOptions,
} from './image/pasted-image-html';

const MARKDOWN_INDICATORS = [
  /^#{1,6}\s/m, // headings
  /\*\*.+?\*\*/, // bold
  /\*.+?\*/, // italic
  /~~.+?~~/, // strikethrough
  /`.+?`/, // inline code
  /^```/m, // code fences
  /^\s*[-*+]\s/m, // unordered lists
  /^\s*\d+\.\s/m, // ordered lists
  /^\s*>\s/m, // blockquotes
  /\[.+?\]\(.+?\)/, // links
  /^---$/m, // horizontal rule
  /^\s*- \[[ x]\]/m, // task lists
];

function looksLikeMarkdown(text: string): boolean {
  const matches = MARKDOWN_INDICATORS.filter((re) => re.test(text));
  return matches.length >= 2;
}

export const MarkdownPaste = Extension.create<PastedImageOptions>({
  name: 'markdownPaste',

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste: (_view, event) => {
            const clipboardData = event.clipboardData;
            if (!clipboardData) {
              return false;
            }

            const html = clipboardData.getData('text/html');
            if (html) {
              return false;
            }

            const text = clipboardData.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) {
              return false;
            }

            event.preventDefault();
            editor
              .chain()
              .setMeta(IMAGE_INSERT_META, true)
              .insertContent(wrapPastedImages(markdownToHtml(text), options), {
                parseOptions: { preserveWhitespace: false },
              })
              .run();
            return true;
          },
        },
      }),
    ];
  },
});
