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
  const { placement, columns } = geometryOf(table);
  const alignments = new Map<number, string>();
  for (const cell of Array.from(row.children)) {
    const spot = placement.get(cell);
    const align = cell.getAttribute('align')?.toLowerCase();
    if (spot && align) {
      alignments.set(spot.column, align);
    }
  }
  return `${Array.from(
    { length: columns },
    (_unused, column) =>
      COLUMN_DIVIDERS.get(alignments.get(column) ?? '') ??
      DEFAULT_COLUMN_DIVIDER
  )
    .map((divider) => `| ${divider} `)
    .join('')}|`;
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
