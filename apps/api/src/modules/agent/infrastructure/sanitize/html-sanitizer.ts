import sanitizeHtml from 'sanitize-html';

import { IMAGE_FIGURE_ATTRIBUTE } from '@knowtis/editor-schema';
import { markdownToHtml } from '@knowtis/note-markdown';
import { isStoredImageUrl } from '@knowtis/shared-util';

const MERMAID_BLOCK_ATTR = 'data-mermaid-block';
const MERMAID_CODE_ATTR = 'data-code';

const ALLOWED_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'strong',
  'em',
  'u',
  's',
  'a',
  'hr',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'mark',
  'sub',
  'sup',
  'figure',
  'figcaption',
  'img',
];

// An image URL the app never stored is an exfiltration channel, so its `src`
// is emptied and `isOrphanedImageMarkup` drops the tag and its figure.
function keepStoredImageOnly(
  tagName: string,
  attribs: sanitizeHtml.Attributes
): sanitizeHtml.Tag {
  return isStoredImageUrl(attribs['src'] ?? '')
    ? { tagName, attribs }
    : { tagName, attribs: {} };
}

function isOrphanedImageMarkup(frame: sanitizeHtml.IFrame): boolean {
  return (
    (frame.tag === 'img' && !frame.attribs['src']) ||
    (frame.tag === 'figure' && frame.mediaChildren.length === 0)
  );
}

/** Allowlists HTML already in the editor's dialect; `markdownToNoteHtml` is the usual entry. */
export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href'],
      div: [MERMAID_BLOCK_ATTR, MERMAID_CODE_ATTR],
      figure: [IMAGE_FIGURE_ATTRIBUTE],
      img: ['src', 'alt', 'width', 'height'],
      ol: ['start'],
      ul: ['data-type'],
      li: ['data-type', 'data-checked'],
    },
    allowedClasses: { code: ['language-*'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: { img: keepStoredImageOnly },
    exclusiveFilter: isOrphanedImageMarkup,
  }).trim();
}

/** Sanitized note body for the editor: mermaid fences become diagram blocks, images stay only from the blob store. */
export function markdownToNoteHtml(markdown: string): string {
  return markdown.trim() ? sanitizeNoteHtml(markdownToHtml(markdown)) : '';
}

const BLOCK_BOUNDARY_PATTERN =
  /<\/(?:p|div|li|ul|ol|h[1-6]|blockquote|pre|table|tr|td|th)>|<br\s*\/?>/gi;

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function htmlToPlainText(html: string): string {
  if (!html.trim()) {
    return '';
  }
  const withBreaks = html.replace(BLOCK_BOUNDARY_PATTERN, '$&\n');
  const stripped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    transformTags: {
      div: (tagName, attribs) =>
        MERMAID_BLOCK_ATTR in attribs
          ? { tagName, attribs: {}, text: attribs[MERMAID_CODE_ATTR] ?? '' }
          : { tagName, attribs },
    },
  });
  const decoded = stripped.replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (entity) => ENTITY_MAP[entity] ?? entity
  );
  return decoded
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
