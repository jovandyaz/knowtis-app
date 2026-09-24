import { createNodeFromContent } from '@tiptap/core';
import { Fragment, type Schema } from '@tiptap/pm/model';
import MarkdownIt from 'markdown-it';

import {
  AI_HTML_PURIFY_CONFIG,
  createAiHtmlPurifier,
} from '../../markdown/ai-html-purifier';
import { mermaidFence } from '../../markdown/mermaid-fence';

const MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
}).use(mermaidFence);

const purifier = createAiHtmlPurifier();

/**
 * Parses markdown into editor nodes, keeping only what the note schema reads
 * (`AI_HTML_PURIFY_CONFIG`): an image the model writes never reaches the
 * editor. Whitespace collapses as it does in the rendered preview, so a soft
 * line break reads as a space; code blocks keep theirs.
 */
export function markdownToFragment(markdown: string, schema: Schema): Fragment {
  const html = purifier.sanitize(
    MARKDOWN_RENDERER.render(markdown),
    AI_HTML_PURIFY_CONFIG
  );
  return Fragment.from(createNodeFromContent(html, schema));
}
