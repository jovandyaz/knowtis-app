import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

/**
 * Renders markdown to sanitized HTML for insertion into the editor.
 *
 * DOMPurify guards against malicious markdown that produces unsafe HTML.
 * Tiptap's `insertContent` will further filter by ProseMirror schema, but
 * the explicit sanitize step keeps this util safe in any consumer context.
 */
export function renderMarkdownToSanitizedHtml(markdown: string): string {
  return DOMPurify.sanitize(MARKDOWN_RENDERER.render(markdown));
}
