import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

const MERMAID_LANGUAGE = 'mermaid';
const MERMAID_BLOCK_ATTR = 'data-mermaid-block';
const MERMAID_CODE_ATTR = 'data-code';

interface RenderEnv {
  readonly mermaidAsDiagram?: boolean;
}

const defaultFence = md.renderer.rules.fence;

md.renderer.rules.fence = (tokens, idx, options, env: RenderEnv, self) => {
  const token = tokens[idx];
  if (env.mermaidAsDiagram && token.info.trim() === MERMAID_LANGUAGE) {
    const code = md.utils.escapeHtml(token.content);
    return `<div ${MERMAID_BLOCK_ATTR} ${MERMAID_CODE_ATTR}="${code}"></div>`;
  }
  return defaultFence
    ? defaultFence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

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
  'div',
];

function renderSafeHtml(markdown: string, env: RenderEnv): string {
  if (!markdown.trim()) {
    return '';
  }
  const rendered = md.render(markdown, env);
  const sanitized = sanitizeHtml(rendered, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href'],
      div: [MERMAID_BLOCK_ATTR, MERMAID_CODE_ATTR],
    },
    allowedClasses: { code: ['language-*'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  });
  return sanitized.trim();
}

/** Sanitized note body for the editor: mermaid fences become diagram blocks. */
export function markdownToNoteHtml(markdown: string): string {
  return renderSafeHtml(markdown, { mermaidAsDiagram: true });
}

/** Sanitized proposal preview for the chat card, which renders raw HTML and so
 *  cannot draw a diagram — mermaid stays a readable code block there. */
export function markdownToPreviewHtml(markdown: string): string {
  return renderSafeHtml(markdown, { mermaidAsDiagram: false });
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
