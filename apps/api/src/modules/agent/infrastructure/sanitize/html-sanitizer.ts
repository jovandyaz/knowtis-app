import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

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
  's',
  'a',
  'hr',
];

export function markdownToSafeHtml(markdown: string): string {
  if (!markdown.trim()) {
    return '';
  }
  const rendered = md.render(markdown);
  const sanitized = sanitizeHtml(rendered, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  });
  return sanitized.trim();
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
