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
  return sanitized.replace(/javascript:/gi, '').trim();
}
