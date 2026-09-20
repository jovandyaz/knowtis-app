/// <reference path="./types/turndown-plugin-gfm.d.ts" />
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

const CELL_LINE_BREAK = /\s*\n+\s*/g;
const CELL_PIPE = /\|/g;
const COLUMN_DIVIDERS = new Map([
  ['left', ':--'],
  ['right', '--:'],
  ['center', ':-:'],
]);
const DEFAULT_COLUMN_DIVIDER = '---';

function toCellText(content: string): string {
  return content.replace(CELL_LINE_BREAK, ' ').trim().replace(CELL_PIPE, '\\|');
}

/** A row heads its table when it sits in a `<thead>`, or is the first row and no earlier `<thead>` holds one. */
function isHeadingRow(row: HTMLElement): boolean {
  const section = row.parentElement;
  if (!section) {
    return false;
  }
  if (section.nodeName === 'THEAD') {
    return true;
  }
  if (row.previousElementSibling !== null) {
    return false;
  }
  if (section.nodeName === 'TABLE') {
    return true;
  }
  if (section.nodeName !== 'TBODY') {
    return false;
  }
  for (
    let earlier = section.previousElementSibling;
    earlier !== null;
    earlier = earlier.previousElementSibling
  ) {
    if (earlier.nodeName === 'THEAD' && earlier.childElementCount > 0) {
      return false;
    }
  }
  return true;
}

function dividerRow(row: HTMLElement): string {
  return Array.from(row.children)
    .map((cell, index) => {
      const align = cell.getAttribute('align')?.toLowerCase() ?? '';
      const divider = COLUMN_DIVIDERS.get(align) ?? DEFAULT_COLUMN_DIVIDER;
      return `${index === 0 ? '| ' : ' '}${divider} |`;
    })
    .join('');
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

// turndown-plugin-gfm only treats a <tbody>'s first row as a heading row when
// nothing precedes the <tbody>, so the editor's <colgroup> sends every stored
// table down the raw-HTML `keep` path. These rules replace its table handling.
turndown.addRule('editorTableCell', {
  filter: ['th', 'td'],
  replacement: (content, node) =>
    `${node.previousElementSibling === null ? '| ' : ' '}${toCellText(content)} |`,
});

turndown.addRule('editorTableRow', {
  filter: 'tr',
  replacement: (content, node) =>
    isHeadingRow(node) ? `\n${content}\n${dividerRow(node)}` : `\n${content}`,
});

turndown.addRule('editorTable', {
  filter: 'table',
  replacement: (content) => `\n\n${content.replace(/\n{2,}/g, '\n')}\n\n`,
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

// turndown runs escape only on text nodes (nodeType 3), never on rule output, so escaping literal
// '~ ^ ==' here keeps them literal across the markdownToHtml round-trip (else markdown-it-sub/sup/mark
// re-parses them); the lookbehind skips delimiters default escape already backslashed to avoid a leaked '\'.
const defaultEscape = turndown.escape.bind(turndown);
turndown.escape = (text) =>
  defaultEscape(text)
    .replace(/(?<!\\)[~^]/g, '\\$&')
    .replace(/(?<!\\)={2,}/g, (run) => run.replace(/=/g, '\\='));

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
