import DOMPurify from 'dompurify';

const FORBID_TAGS = [
  'img',
  'picture',
  'source',
  'audio',
  'video',
  'iframe',
  'svg',
  'math',
  'form',
  'link',
  'meta',
  'base',
];

const FORBID_ATTR = ['style', 'srcset', 'ping', 'background', 'formaction'];

/**
 * Sanitizes LLM-produced HTML for rendering via dangerouslySetInnerHTML.
 * Beyond DOMPurify defaults, strips every element/attribute that auto-fires
 * a network request (img/media/CSS url()) — assistant output is injectable
 * via shared-note content, so a remote fetch is an exfiltration channel.
 */
export function sanitizeAiHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR,
  });
}
