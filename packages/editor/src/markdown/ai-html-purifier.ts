import DOMPurify, { type DOMPurify as Purifier } from 'dompurify';

import { MERMAID_BLOCK_ATTR, MERMAID_CODE_ATTR } from './mermaid-fence';

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
