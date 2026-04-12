import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt('commonmark', {
  html: false,
  linkify: true,
  typographer: false,
});

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

export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste: (_view, event) => {
            const clipboardData = event.clipboardData;
            if (!clipboardData) {
              return false;
            }

            // If there's HTML content, let Tiptap handle it natively
            const html = clipboardData.getData('text/html');
            if (html) {
              return false;
            }

            const text = clipboardData.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) {
              return false;
            }

            event.preventDefault();
            const rendered = md.render(text);
            editor.commands.insertContent(rendered, {
              parseOptions: { preserveWhitespace: false },
            });
            return true;
          },
        },
      }),
    ];
  },
});
