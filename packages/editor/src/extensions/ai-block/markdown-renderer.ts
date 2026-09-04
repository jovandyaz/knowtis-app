import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

import { AI_HTML_FORBID_ATTR, AI_HTML_FORBID_TAGS } from '@knowtis/shared-util';

import {
  MERMAID_BLOCK_ATTR,
  MERMAID_CODE_ATTR,
  mermaidFence,
} from '../../markdown/mermaid-fence';

const MARKDOWN_RENDERER = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
}).use(mermaidFence);

const purifier = DOMPurify(window);
const stashedMermaidCode = new WeakMap<Element, string>();

// DOMPurify drops any attribute whose value contains `-->` or `/>` (its
// SAFE_FOR_XML / self-closing guards against re-serialization mXSS), which is
// nearly every mermaid diagram. The value is inert here: it only travels as a
// quoted attribute into Tiptap's DOMParser and out through setAttribute. So
// the code is parked before those checks and put back on the mermaid element
// alone once they have run.
purifier.addHook('uponSanitizeAttribute', (node, event) => {
  if (
    event.attrName === MERMAID_CODE_ATTR &&
    node.hasAttribute(MERMAID_BLOCK_ATTR)
  ) {
    stashedMermaidCode.set(node, event.attrValue);
    event.attrValue = '';
  }
});

purifier.addHook('afterSanitizeAttributes', (node) => {
  const code = stashedMermaidCode.get(node);
  if (code !== undefined) {
    node.setAttribute(MERMAID_CODE_ATTR, code);
    stashedMermaidCode.delete(node);
  }
});

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
