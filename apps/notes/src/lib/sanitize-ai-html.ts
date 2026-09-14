import DOMPurify from 'dompurify';

import { AI_HTML_FORBID_ATTR, AI_HTML_FORBID_TAGS } from '@knowtis/shared-util';

/**
 * Sanitizes LLM-produced HTML before it is rendered, whether injected as raw
 * HTML or parsed into the editor's ProseMirror schema. Beyond DOMPurify
 * defaults, strips every element/attribute that auto-fires a network request
 * (img/media/CSS url()) — assistant output is injectable via shared-note
 * content, so a remote fetch is an exfiltration channel.
 */
export function sanitizeAiHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: AI_HTML_FORBID_TAGS,
    FORBID_ATTR: AI_HTML_FORBID_ATTR,
  });
}
