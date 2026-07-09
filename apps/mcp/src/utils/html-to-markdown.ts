import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const MERMAID_BLOCK_ATTRIBUTE = 'data-mermaid-block';

function isMermaidBlock(node: HTMLElement): boolean {
  return node.nodeName === 'DIV' && node.hasAttribute(MERMAID_BLOCK_ATTRIBUTE);
}

function mermaidFence(node: HTMLElement): string {
  const code = node.getAttribute('data-code') ?? '';
  return `\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n`;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  // Mermaid blocks are empty <div>s that turndown skips as blank before any
  // rule runs, so they must be recovered here.
  blankReplacement: (_content, node) => {
    if (isMermaidBlock(node)) {
      return mermaidFence(node);
    }
    return 'isBlock' in node && node.isBlock === true ? '\n\n' : '';
  },
});

turndown.use(gfm);

turndown.addRule('tiptapTaskItem', {
  filter: (node) =>
    node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => {
    const checked = node.getAttribute('data-checked') === 'true';
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
  },
});

turndown.addRule('highlight', {
  filter: 'mark',
  replacement: (content) => `==${content}==`,
});

turndown.addRule('subscript', {
  filter: 'sub',
  replacement: (content) => `~${content}~`,
});

turndown.addRule('superscript', {
  filter: 'sup',
  replacement: (content) => `^${content}^`,
});

// gfm's strikethrough emits single '~', clashing with subscript; force '~~'.
turndown.addRule('strikethrough', {
  filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
  replacement: (content) => `~~${content}~~`,
});

// turndown runs escape only on text nodes, never on rule output (turndown.cjs.js:703),
// so escaping literal '~ ^ ==' here keeps them literal on the markdownToHtml round-trip
// (markdown-it-sub/sup/mark would otherwise re-interpret them) while intended marks stay intact.
const defaultEscape = turndown.escape.bind(turndown);
turndown.escape = (text) =>
  defaultEscape(text)
    .replace(/[~^]/g, '\\$&')
    .replace(/={2,}/g, (run) => run.replace(/=/g, '\\='));

/**
 * Converts Tiptap-produced HTML to Markdown, inverting `markdownToHtml`:
 * task lists, `==mark==`, `~sub~`, `^sup^`, `~~del~~`, mermaid blocks and GFM
 * tables survive a round-trip. Intended marks (emitted by rules) round-trip
 * unescaped; literal `~`, `^`, and `==` in text are backslash-escaped so they
 * survive as literals rather than re-parsing into marks via `markdownToHtml`.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
