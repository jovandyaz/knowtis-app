/**
 * DOMPurify hardening lists for LLM-produced HTML. Beyond DOMPurify defaults,
 * these strip every element/attribute that auto-fires a network request
 * (img/media/CSS url()) — assistant output is injectable via shared content,
 * so a remote fetch is an exfiltration channel. Shared so the notes renderer
 * and the editor markdown renderer cannot drift apart.
 */
export const AI_HTML_FORBID_TAGS = [
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

export const AI_HTML_FORBID_ATTR = [
  'style',
  'srcset',
  'ping',
  'background',
  'formaction',
];
