import DOMPurify, { type Config, type DOMPurify as Purifier } from 'dompurify';

import { MERMAID_BLOCK_ATTR, MERMAID_CODE_ATTR } from './mermaid-fence';

const NOTE_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'mark',
  'sub',
  'sup',
  'a',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

const NOTE_ATTRIBUTES = [
  'href',
  'target',
  'rel',
  'title',
  'class',
  'start',
  'type',
  'colspan',
  'rowspan',
  'data-colwidth',
  'data-type',
  'data-checked',
  'data-color',
  MERMAID_BLOCK_ATTR,
  MERMAID_CODE_ATTR,
  'data-view-mode',
];

/**
 * DOMPurify config that keeps only the elements and attributes the note schema
 * reads (headings, lists and task lists, tables, code, quotes, rules, marks,
 * links, mermaid blocks), so nothing that could load a resource survives:
 * `style`, media, embeds, SVG, MathML, form controls. Images are left out; a
 * sanitizer that keeps the app's stored images adds them itself.
 */
export const AI_HTML_PURIFY_CONFIG = {
  ALLOWED_TAGS: NOTE_TAGS,
  ALLOWED_ATTR: NOTE_ATTRIBUTES,
  ALLOW_DATA_ATTR: false,
} satisfies Config;

/**
 * Creates the DOMPurify instance every sanitizer of LLM-shaped HTML uses. It
 * keeps a mermaid block's `data-code` whole, where DOMPurify alone drops any
 * attribute value holding `-->` or `/>`: nearly every diagram.
 */
export function createAiHtmlPurifier(): Purifier {
  const purifier = DOMPurify(window);
  const stashedMermaidCode = new WeakMap<Element, string>();

  // those guards (SAFE_FOR_XML) stop re-serialization mXSS, which the code
  // cannot cause: it stays a quoted attribute of an HTML div in every sink. So
  // it is parked before the checks and put back on the mermaid element alone
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

  return purifier;
}
