import { createNodeFromContent } from '@tiptap/core';
import { Fragment, type Schema } from '@tiptap/pm/model';
import MarkdownIt from 'markdown-it';

import { AI_HTML_FORBID_ATTR, AI_HTML_FORBID_TAGS } from '@knowtis/shared-util';

import { createAiHtmlPurifier } from '../../markdown/ai-html-purifier';
import { mermaidFence } from '../../markdown/mermaid-fence';

const MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
}).use(mermaidFence);

const purifier = createAiHtmlPurifier();

/**
 * Renders markdown to sanitized HTML for insertion into the editor.
 *
 * DOMPurify guards against malicious markdown that produces unsafe HTML.
 * Markdown image syntax (`![alt](url)`) lowers to `<img src>`, which would
 * otherwise auto-fire a network request against LLM-controlled URLs, so
 * FORBID_TAGS/FORBID_ATTR strip that channel beyond DOMPurify's defaults.
 * Tiptap's `insertContent` will further filter by ProseMirror schema, but
 * the explicit sanitize step keeps this util safe in any consumer context.
 */
export function renderMarkdownToSanitizedHtml(markdown: string): string {
  return purifier.sanitize(MARKDOWN_RENDERER.render(markdown), {
    FORBID_TAGS: AI_HTML_FORBID_TAGS,
    FORBID_ATTR: AI_HTML_FORBID_ATTR,
  });
}

/**
 * Parses markdown into editor nodes through
 * {@link renderMarkdownToSanitizedHtml}. Whitespace collapses as it does in the
 * rendered preview, so a soft line break reads as a space; code blocks keep
 * theirs.
 */
export function markdownToFragment(markdown: string, schema: Schema): Fragment {
  return Fragment.from(
    createNodeFromContent(renderMarkdownToSanitizedHtml(markdown), schema)
  );
}
