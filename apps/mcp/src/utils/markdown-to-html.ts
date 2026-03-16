import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

/**
 * Converts Markdown content to HTML compatible with Tiptap editor.
 */
export function markdownToHtml(markdown: string): string {
  return md.render(markdown);
}
