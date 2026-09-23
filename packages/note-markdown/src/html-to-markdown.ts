/// <reference path="./types/turndown-plugin-gfm.d.ts" />
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import { IMAGE_FIGURE_ATTRIBUTE } from './image-figure';
import { TRAILING_NEWLINES } from './text-patterns';

const MERMAID_BLOCK_ATTRIBUTE = 'data-mermaid-block';
const MERMAID_BLOCK_SELECTOR = `[${MERMAID_BLOCK_ATTRIBUTE}]`;
const KEPT_WHEN_EMPTY = `p, h1, h2, h3, h4, h5, h6, pre, ${MERMAID_BLOCK_SELECTOR}`;
const BLANK_LINE = '&nbsp;';
const NBSP_ENTITY = '&nbsp;';
const EDGE_NBSP_RUNS = /^\u00a0+|\u00a0+$/g;
const HEADING_TAG = /^H([1-6])$/;
const HEADING_MARKER = '#';
const TABLE_CELL_TAGS = new Set(['TD', 'TH']);

function keepEdgeSpaces(text: string): string {
  return text.replace(EDGE_NBSP_RUNS, (run) => NBSP_ENTITY.repeat(run.length));
}

function headingLine(heading: HTMLElement, content: string): string {
  const level = Number(HEADING_TAG.exec(heading.nodeName)?.[1]);
  const marker = HEADING_MARKER.repeat(level);
  const text = keepEdgeSpaces(content);
  return `\n\n${text ? `${marker} ${text}` : marker}\n\n`;
}

function isTableCell(node: HTMLElement | null): boolean {
  return node !== null && TABLE_CELL_TAGS.has(node.nodeName);
}

function isMermaidBlock(node: HTMLElement): boolean {
  return node.nodeName === 'DIV' && node.hasAttribute(MERMAID_BLOCK_ATTRIBUTE);
}

function mermaidFence(node: HTMLElement): string {
  const code = (node.getAttribute('data-code') ?? '').replace(
    TRAILING_NEWLINES,
    ''
  );
  return `\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n`;
}

const ENTITY_REFERENCE_START = /&(?=#?[a-z0-9]+;)/gi;
const ALT_SPECIALS = /[\\[\]`]/g;
const TITLE_SPECIALS = /[\\"]/g;

function escapeLinkText(text: string, specials: RegExp): string {
  return text.replace(specials, '\\$&').replace(ENTITY_REFERENCE_START, '\\&');
}

function isImageFigure(node: HTMLElement): boolean {
  return (
    node.nodeName === 'FIGURE' && node.hasAttribute(IMAGE_FIGURE_ATTRIBUTE)
  );
}

function imageMarkdown(node: HTMLElement): string {
  const img = node.querySelector('img');
  if (!img) {
    return '';
  }
  const alt = escapeLinkText(img.getAttribute('alt') ?? '', ALT_SPECIALS);
  const caption = node.querySelector('figcaption')?.textContent ?? '';
  const title = caption ? ` "${escapeLinkText(caption, TITLE_SPECIALS)}"` : '';
  return `\n\n![${alt}](${img.getAttribute('src') ?? ''}${title})\n\n`;
}

const CELL_LINE_BREAK = /\s*\n+\s*/g;
const CELL_PIPE = /\|/g;
const COLUMN_DIVIDER = '---';
const EMPTY_CELL = '|  ';

interface CellPlacement {
  readonly column: number;
  readonly colspan: number;
}

interface TableGeometry {
  readonly placement: Map<Element, CellPlacement>;
  readonly headingRow: Element | null;
  readonly columns: number;
}

const geometryCache = new WeakMap<Element, TableGeometry>();
const ROWSPAN_TO_END_OF_GROUP = 0;

function spanOf(cell: Element, attribute: string): number {
  const parsed = Number.parseInt(cell.getAttribute(attribute) ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
}

function ownRows(scope: Element, table: Element): Element[] {
  return Array.from(scope.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table
  );
}

/** Row groups in document order; a table may also hold rows with no group. */
function rowGroupsOf(table: Element): Element[][] {
  const sections = Array.from(table.children).filter((child) =>
    ['THEAD', 'TBODY', 'TFOOT'].includes(child.nodeName)
  );
  if (sections.length === 0) {
    return [ownRows(table, table)];
  }
  return sections
    .map((section) => ownRows(section, table))
    .filter((rows) => rows.length > 0);
}

/**
 * Where every cell sits once `rowspan` and `colspan` are accounted for. GFM has
 * no merged cell, so a span is dropped — but dropping it must not slide the
 * cells after it into another column, which would change what a row says with
 * nothing to show for it. A span reaches only the rest of its own row group,
 * as HTML defines it.
 */
function geometryOf(table: Element): TableGeometry {
  const cached = geometryCache.get(table);
  if (cached) {
    return cached;
  }
  const placement = new Map<Element, CellPlacement>();
  let columns = 0;
  let headingRow: Element | null = null;
  for (const rows of rowGroupsOf(table)) {
    const carried = new Map<number, Set<number>>();
    rows.forEach((row, rowIndex) => {
      const taken = carried.get(rowIndex) ?? new Set<number>();
      let column = 0;
      for (const cell of Array.from(row.children)) {
        while (taken.has(column)) {
          column += 1;
        }
        const colspan = Math.max(1, spanOf(cell, 'colspan'));
        const rowspan = spanOf(cell, 'rowspan');
        const reach =
          rowspan === ROWSPAN_TO_END_OF_GROUP
            ? rows.length - rowIndex
            : Math.max(1, rowspan);
        placement.set(cell, { column, colspan });
        for (let below = 1; below < reach; below += 1) {
          const later = carried.get(rowIndex + below) ?? new Set<number>();
          for (let offset = 0; offset < colspan; offset += 1) {
            later.add(column + offset);
          }
          carried.set(rowIndex + below, later);
        }
        column += colspan;
        columns = Math.max(columns, column);
      }
    });
  }
  const [firstGroup] = rowGroupsOf(table);
  const [firstRow] = firstGroup ?? [];
  if (firstRow && isHeadingCandidate(firstRow)) {
    headingRow = firstRow;
  }
  const geometry = { placement, headingRow, columns };
  geometryCache.set(table, geometry);
  return geometry;
}

function toCellText(content: string): string {
  return content.replace(CELL_LINE_BREAK, ' ').trim().replace(CELL_PIPE, '\\|');
}

/** The first row heads the table unless a non-empty `<thead>` precedes it. */
function isHeadingCandidate(row: Element): boolean {
  const section = row.parentElement;
  if (!section) {
    return false;
  }
  if (section.nodeName === 'THEAD' || section.nodeName === 'TABLE') {
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

/** GFM allows exactly one heading row, so only the table's first row gets the divider. */
function isHeadingRow(row: HTMLElement): boolean {
  const table = row.closest('table');
  return table !== null && geometryOf(table).headingRow === row;
}

function dividerRow(row: HTMLElement): string {
  const table = row.closest('table');
  if (!table) {
    return '';
  }
  const { columns } = geometryOf(table);
  return `${Array.from({ length: columns }, () => `| ${COLUMN_DIVIDER} `).join('')}|`;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  // turndown skips all rules for a textless node, but the editor keeps empty
  // paragraphs, headings and code blocks; a diagram's code is an attribute.
  blankReplacement: (content, node) => {
    if (isMermaidBlock(node)) {
      return mermaidFence(node);
    }
    if (node.nodeName === 'P') {
      if (isTableCell(node.parentElement)) {
        return keepEdgeSpaces(node.textContent ?? '');
      }
      return opensItemBody(node) ? '\n\n' : `\n\n${BLANK_LINE}\n\n`;
    }
    if (HEADING_TAG.test(node.nodeName)) {
      return headingLine(node, node.textContent ?? '');
    }
    if (node.querySelector(KEPT_WHEN_EMPTY) || node.matches(KEPT_WHEN_EMPTY)) {
      return replaceByOwnRule(content, node);
    }
    return 'isBlock' in node && node.isBlock === true ? '\n\n' : '';
  },
});

// The editor recreates the empty paragraph an item opens with, so `&nbsp;`
// there would add one; above a plain item's text it keeps the two apart.
function opensItemBody(paragraph: HTMLElement): boolean {
  const parent = paragraph.parentElement;
  if (!parent) {
    return false;
  }
  if (parent.firstElementChild !== paragraph) {
    return false;
  }
  if (isTaskItemBody(parent)) {
    return true;
  }
  return (
    parent.nodeName === 'LI' && paragraph.nextElementSibling?.nodeName !== 'P'
  );
}

function replaceByOwnRule(content: string, node: HTMLElement): string {
  Object.assign(node, { isBlank: false });
  const { replacement } = turndown.rules.forNode(node);
  return replacement ? replacement(content, node, turndown.options) : content;
}

turndown.use(gfm);

turndown.addRule('editorHeading', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => headingLine(node, content),
});

const SINGLE_LINE_BLOCKS = 'h1, h2, h3, h4, h5, h6, td, th';
const HARD_BREAK = '\\\n';
const LINE_END = '\n';

function isSingleLine(node: HTMLElement): boolean {
  return node.closest(SINGLE_LINE_BLOCKS) !== null;
}

turndown.addRule('editorLineBreak', {
  filter: 'br',
  replacement: (_content, node) => (isSingleLine(node) ? LINE_END : HARD_BREAK),
});

function paragraphText(content: string, paragraph: HTMLElement): string {
  const text = keepEdgeSpaces(content);
  if (isSingleLine(paragraph)) {
    return text;
  }
  return paragraph.lastChild?.nodeName === 'BR' ? `${text}${BLANK_LINE}` : text;
}

turndown.addRule('editorParagraph', {
  filter: 'p',
  replacement: (content, node) => `\n\n${paragraphText(content, node)}\n\n`,
});

const CONTINUATION_LINE = /\n/g;
const LIST_TAGS = new Set(['UL', 'OL']);

function isTaskItem(node: HTMLElement | null): boolean {
  return (
    node?.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem'
  );
}

function isTaskItemBody(node: HTMLElement | null): boolean {
  return node?.nodeName === 'DIV' && isTaskItem(node.parentElement);
}

function isList(node: Element | null | undefined): boolean {
  return node != null && LIST_TAGS.has(node.nodeName);
}

function taskItemBody(item: HTMLElement): Element | undefined {
  return Array.from(item.children).find((child) => child.nodeName === 'DIV');
}

function isEmptyParagraph(node: Element | null | undefined): boolean {
  return node?.nodeName === 'P' && node.childNodes.length === 0;
}

turndown.addRule('tiptapTaskItem', {
  filter: (node) => isTaskItem(node),
  replacement: (content, node) => {
    const checked = node.getAttribute('data-checked') === 'true';
    const marker = `- [${checked ? 'x' : ' '}]`;
    const body = content.trim().replace(CONTINUATION_LINE, '\n  ');
    const text = taskItemBody(node)?.firstElementChild;
    if (!isEmptyParagraph(text)) {
      return `${marker} ${body}\n`;
    }
    if (!body) {
      return `${marker}\n`;
    }
    // Whatever follows a bare marker would become its text, so any block but a
    // sublist is parted from it by a blank line.
    const gap = isList(text?.nextElementSibling) ? '\n  ' : '\n  \n  ';
    return `${marker}${gap}${body}\n`;
  },
});

// turndown parts a sublist from its item's text with a blank line task lists
// are not written with; matched on structure, since the text may be code.
turndown.addRule('taskItemTextAboveSublist', {
  filter: (node) =>
    node.nodeName === 'P' &&
    isTaskItemBody(node.parentElement) &&
    isList(node.nextElementSibling),
  replacement: (content, node) => `\n\n${paragraphText(content, node)}\n`,
});

turndown.addRule('taskItemSublist', {
  filter: (node) =>
    isList(node) &&
    isTaskItemBody(node.parentElement) &&
    node.previousElementSibling?.nodeName === 'P',
  replacement: (content) => `\n${content}\n\n`,
});

const FENCE_CHAR = '`';
const MIN_FENCE_LENGTH = 3;
const FENCE_RUN_AT_LINE_START = /^ {0,3}(`{3,})/gm;
const CODE_LANGUAGE = /language-(\S+)/;

// turndown drops the code's last newline and markdownToHtml the fence's, so
// code ending in a newline would lose one per round trip.
turndown.addRule('verbatimCodeBlock', {
  filter: (node) =>
    node.nodeName === 'PRE' && node.firstElementChild?.nodeName === 'CODE',
  replacement: (_content, node) => {
    const code = node.firstElementChild;
    const text = code?.textContent ?? '';
    const language =
      code?.getAttribute('class')?.match(CODE_LANGUAGE)?.[1] ?? '';
    const longestRun = Math.max(
      0,
      ...Array.from(
        text.matchAll(FENCE_RUN_AT_LINE_START),
        ([, run]) => run.length
      )
    );
    const fence = FENCE_CHAR.repeat(Math.max(MIN_FENCE_LENGTH, longestRun + 1));
    return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
  },
});

// turndown-plugin-gfm only treats a <tbody>'s first row as a heading row when
// nothing precedes the <tbody>, so the editor's <colgroup> sends every stored
// table down the raw-HTML `keep` path. These rules replace its table handling.
turndown.addRule('editorTableCell', {
  filter: ['th', 'td'],
  replacement: (content, node) => {
    const table = node.closest('table');
    const geometry = table ? geometryOf(table) : undefined;
    const spot = geometry?.placement.get(node);
    if (!geometry || !spot) {
      return `| ${toCellText(content)} `;
    }
    const previous = node.previousElementSibling;
    const previousSpot = previous
      ? geometry.placement.get(previous)
      : undefined;
    const resumesAt = previousSpot
      ? previousSpot.column + previousSpot.colspan
      : 0;
    const gap = Math.max(0, spot.column - resumesAt);
    return `${EMPTY_CELL.repeat(gap)}| ${toCellText(content)} ${EMPTY_CELL.repeat(spot.colspan - 1)}`;
  },
});

turndown.addRule('editorTableRow', {
  filter: 'tr',
  replacement: (content, node) =>
    isHeadingRow(node) ? `\n${content}|\n${dividerRow(node)}` : `\n${content}|`,
});

turndown.addRule('editorTable', {
  filter: 'table',
  replacement: (content) => `\n\n${content.replace(/\n{2,}/g, '\n')}\n\n`,
});

turndown.addRule('editorImage', {
  filter: (node) => isImageFigure(node),
  replacement: (_content, node) => imageMarkdown(node as HTMLElement),
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

// gfm writes strikethrough with a single '~', which markdown-it-sub would read back as subscript.
turndown.addRule('strikethrough', {
  filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
  replacement: (content) => `~~${content}~~`,
});

// turndown runs escape only on text nodes (nodeType 3), never on rule output, so escaping literal
// '~ ^ ==' here keeps them literal across the markdownToHtml round-trip (else markdown-it-sub/sup/mark
// re-parses them); the lookbehind skips delimiters default escape already backslashed to avoid a leaked '\'.
// An '&' that opens an entity reference is escaped too, or markdown-it would decode text the user typed.
const defaultEscape = turndown.escape.bind(turndown);
turndown.escape = (text) =>
  defaultEscape(text)
    .replace(/(?<!\\)[~^]/g, '\\$&')
    .replace(/(?<!\\)={2,}/g, (run) => run.replace(/=/g, '\\='))
    .replace(ENTITY_REFERENCE_START, '\\&');

/**
 * Converts Tiptap-produced HTML to Markdown, inverting `markdownToHtml`:
 * task lists, `==mark==`, `~sub~`, `^sup^`, `~~del~~`, mermaid, images and GFM
 * tables survive a round-trip. Intended marks (emitted by rules) round-trip
 * unescaped; literal `~`, `^`, and `==` in text are backslash-escaped so they
 * survive as literals rather than re-parsing into marks via `markdownToHtml`.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
