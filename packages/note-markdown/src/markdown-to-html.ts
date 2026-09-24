/// <reference path="./types/markdown-it-plugins.d.ts" />
import MarkdownIt from 'markdown-it';
import markdownItIns from 'markdown-it-ins';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';

import { IMAGE_FIGURE_ATTRIBUTE } from './image-figure';
import { BLANK_TEXT, TRAILING_NEWLINES } from './text-patterns';

const MERMAID_LANGUAGE = 'mermaid';
const FENCE_NEWLINE = /\n$/;

const EMPTY_PARAGRAPH = '<p></p>';

const TASK_LIST_UL_PATTERN = /<ul class="contains-task-list">/g;
const LOOSE_TASK_ITEM_PATTERN =
  /(<li class="task-list-item[^"]*">)\s*<p>(<label><input class="task-list-item-checkbox"[^>]*>[\s\S]*?<\/label>)<\/p>/g;
const TASK_LIST_ITEM_PATTERN =
  /<li class="task-list-item[^"]*"><label><input class="task-list-item-checkbox"( checked="")?[^>]*>[ \t\n]*([\s\S]*?)<\/label>/g;
const ASCII_EDGE_SPACE = /^[ \t\n]+|[ \t\n]+$/g;

// markdown-it wraps a loose item's checkbox in its own <p>, so that wrapper is
// dropped first and one rewrite then covers both shapes. The rewrite stops at
// </label> and leaves the item's own </li>: consuming it would make the item
// swallow the sublist that follows.
function rewriteTaskListFormat(html: string): string {
  return html
    .replace(TASK_LIST_UL_PATTERN, '<ul data-type="taskList">')
    .replace(LOOSE_TASK_ITEM_PATTERN, '$1$2')
    .replace(TASK_LIST_ITEM_PATTERN, (_match, checkedAttr, content) => {
      const checked = checkedAttr ? 'true' : 'false';
      return `<li data-type="taskItem" data-checked="${checked}"><div><p>${content.replace(ASCII_EDGE_SPACE, '')}</p>`;
    });
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

md.use(markdownItTaskLists, { enabled: true, label: true });
md.use(markdownItIns);
md.use(markdownItMark);
md.use(markdownItSup);
md.use(markdownItSub);

// The editor's underline mark parses only <u>, so it would drop the plugin's <ins>.
md.renderer.rules['ins_open'] = () => '<u>';
md.renderer.rules['ins_close'] = () => '</u>';

type Token = ReturnType<MarkdownIt['parse']>[number];

const BARE_CHECKBOX = /^\[[ xX]\]$/;

function isBareCheckbox(token: Token): boolean {
  const [only, ...rest] = token.children ?? [];
  return (
    token.type === 'inline' &&
    BARE_CHECKBOX.test(token.content) &&
    only?.type === 'text' &&
    rest.length === 0
  );
}

// markdown-it trims the space after a bare checkbox and the task-list plugin
// needs one, so an empty task would come back as a bullet reading "[ ]".
md.core.ruler.before('github-task-lists', 'bare-checkbox', (state) => {
  state.tokens.forEach((token, idx, tokens) => {
    if (
      tokens[idx - 1]?.type === 'paragraph_open' &&
      tokens[idx - 2]?.type === 'list_item_open' &&
      isBareCheckbox(token)
    ) {
      token.content += ' ';
    }
  });
});

const BLANK_INLINE_TYPES = new Set(['text', 'softbreak']);

function isBlankInline(token: Token): boolean {
  const children = token.children ?? [];
  return (
    children.length > 0 &&
    children.every(
      (child) =>
        BLANK_INLINE_TYPES.has(child.type) && BLANK_TEXT.test(child.content)
    )
  );
}

// Markdown has no empty paragraph, so the editor's blank line is written as a
// line of only `&nbsp;`.
md.core.ruler.push('blank-paragraph', (state) => {
  state.tokens.forEach((token, idx, tokens) => {
    if (
      token.type === 'inline' &&
      tokens[idx - 1]?.type === 'paragraph_open' &&
      isBlankInline(token)
    ) {
      token.children = [];
    }
  });
});

const TASK_LIST_CLASS = 'contains-task-list';
const TASK_LIST_ITEM_CLASS = 'task-list-item';
const ORDERED_LIST_START = 'start';
const FIRST_NUMBER = 1;
const BULLET_LIST = {
  open: 'bullet_list_open',
  close: 'bullet_list_close',
  tag: 'ul',
};
const ORDERED_LIST = {
  open: 'ordered_list_open',
  close: 'ordered_list_close',
  tag: 'ol',
};

function isTaskListItem(token: Token | undefined): boolean {
  return (
    token?.attrGet('class')?.split(' ').includes(TASK_LIST_ITEM_CLASS) ?? false
  );
}

interface ListRuns {
  readonly open: Token;
  readonly firstNumber: number;
  run: Token;
  holdsTasks?: boolean;
  items: number;
}

function shapeRun(list: ListRuns, run: Token, holdsTasks: boolean): void {
  const numbered = !holdsTasks && list.open.type === ORDERED_LIST.open;
  const kind = numbered ? ORDERED_LIST : BULLET_LIST;
  const number = list.firstNumber + list.items;
  run.type = kind.open;
  run.tag = kind.tag;
  if (holdsTasks) {
    run.attrs = [['class', TASK_LIST_CLASS]];
  } else {
    run.attrs =
      numbered && number !== FIRST_NUMBER
        ? [[ORDERED_LIST_START, String(number)]]
        : null;
  }
}

function closeRun(run: Token, close: Token): Token {
  const kind = run.type === ORDERED_LIST.open ? ORDERED_LIST : BULLET_LIST;
  close.type = kind.close;
  close.tag = kind.tag;
  return close;
}

md.core.ruler.after('github-task-lists', 'split-mixed-task-lists', (state) => {
  const lists: ListRuns[] = [];
  const tokens: Token[] = [];
  const blockToken = (from: Token, nesting: Token['nesting']): Token =>
    Object.assign(new state.Token(from.type, from.tag, nesting), {
      block: true,
      level: from.level,
    });
  for (const token of state.tokens) {
    const list = lists[lists.length - 1];
    if (token.type === BULLET_LIST.open || token.type === ORDERED_LIST.open) {
      lists.push({
        open: token,
        firstNumber: Number(token.attrGet(ORDERED_LIST_START) ?? FIRST_NUMBER),
        run: token,
        items: 0,
      });
    } else if (token.type === 'list_item_open' && list) {
      const holdsTasks = isTaskListItem(token);
      if (list.holdsTasks === undefined) {
        shapeRun(list, list.run, holdsTasks);
      } else if (list.holdsTasks !== holdsTasks) {
        tokens.push(closeRun(list.run, blockToken(list.run, -1)));
        list.run = blockToken(list.open, 1);
        shapeRun(list, list.run, holdsTasks);
        tokens.push(list.run);
      }
      list.holdsTasks = holdsTasks;
      list.items += 1;
    } else if (
      token.type === BULLET_LIST.close ||
      token.type === ORDERED_LIST.close
    ) {
      const closed = lists.pop();
      if (closed) {
        closeRun(closed.run, token);
      }
    }
    tokens.push(token);
  }
  state.tokens = tokens;
});

function openingTokenOf(tokens: Token[], closeIdx: number): Token | undefined {
  const { level } = tokens[closeIdx];
  for (let idx = closeIdx - 1; idx >= 0; idx -= 1) {
    const token = tokens[idx];
    if (token.type === 'list_item_open' && token.level === level) {
      return token;
    }
  }
  return undefined;
}

// The editor reads a task item's content from its first <div>; without the
// wrapper, a diagram inside the item would be read as that content.
md.renderer.rules['list_item_close'] = (tokens, idx, options, _env, self) => {
  const close = self.renderToken(tokens, idx, options);
  return isTaskListItem(openingTokenOf(tokens, idx)) ? `</div>${close}` : close;
};

function isLoneImage(token: Token | undefined): boolean {
  if (!token || token.type !== 'inline') {
    return false;
  }
  const visible = (token.children ?? []).filter(
    (child) => child.type !== 'softbreak'
  );
  return visible.length === 1 && visible[0].type === 'image';
}

function altAsWritten(image: Token): string {
  return md.utils.unescapeAll(image.content);
}

md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx];
  const src = md.utils.escapeHtml(token.attrGet('src') ?? '');
  const alt = md.utils.escapeHtml(altAsWritten(token));
  const caption = md.utils.escapeHtml(token.attrGet('title') ?? '');
  return `<figure ${IMAGE_FIGURE_ATTRIBUTE}><img src="${src}" alt="${alt}"><figcaption>${caption}</figcaption></figure>`;
};

// The editor's image is a block, so a lone image's paragraph would split into
// two empty ones; a tight list's hidden paragraph ends without a newline.
md.renderer.rules['paragraph_open'] = (tokens, idx, options, _env, self) =>
  isLoneImage(tokens[idx + 1]) ? '' : self.renderToken(tokens, idx, options);
md.renderer.rules['paragraph_close'] = (tokens, idx, options, _env, self) => {
  if (!isLoneImage(tokens[idx - 1])) {
    return self.renderToken(tokens, idx, options);
  }
  return tokens[idx].hidden ? '' : '\n';
};

function opensWithParagraph(tokens: Token[], itemIdx: number): boolean {
  const next = tokens[itemIdx + 1];
  const inline = tokens[itemIdx + 2];
  return next?.type === 'paragraph_open' && !isLoneImage(inline);
}

// The editor's list item must open with a paragraph: given any other block
// first, it lifts that block out of the list and leaves an empty bullet.
md.renderer.rules['list_item_open'] = (tokens, idx, options, _env, self) => {
  const open = self.renderToken(tokens, idx, options);
  return opensWithParagraph(tokens, idx) ? open : `${open}${EMPTY_PARAGRAPH}`;
};

const LABEL_OPENING_TOKENS = 2;
const LABEL_CLOSING_TOKENS = 1;
const LINE_BREAKS = new Set(['softbreak', 'hardbreak']);

function isEdgeFiller(token: Token): boolean {
  return (
    LINE_BREAKS.has(token.type) ||
    (token.type === 'text' && token.content.trim() === '')
  );
}

function trimFragment(fragment: Token[]): Token[] {
  let start = 0;
  let end = fragment.length;
  while (start < end && isEdgeFiller(fragment[start])) {
    start += 1;
  }
  while (end > start && isEdgeFiller(fragment[end - 1])) {
    end -= 1;
  }
  const kept = fragment.slice(start, end);
  const first = kept[0];
  const last = kept[kept.length - 1];
  if (first?.type === 'text') {
    first.content = first.content.trimStart();
  }
  if (last?.type === 'text') {
    last.content = last.content.trimEnd();
  }
  return kept;
}

function fragmentsAroundImages(children: Token[]): Token[][] {
  const fragments: Token[][] = [[]];
  let depth = 0;
  for (const child of children) {
    if (depth === 0 && child.type === 'image') {
      fragments.push([child], []);
    } else {
      depth += child.nesting;
      fragments[fragments.length - 1].push(child);
    }
  }
  return fragments;
}

function paragraphsAroundImages(
  inline: Token,
  isTaskLabel: boolean
): Token[][] | null {
  const children = inline.children ?? [];
  const labelEnd = children.length - LABEL_CLOSING_TOKENS;
  const body = isTaskLabel
    ? children.slice(LABEL_OPENING_TOKENS, labelEnd)
    : children;
  const fragments = fragmentsAroundImages(body);
  if (fragments.length === 1) {
    return null;
  }
  const [first, ...rest] = fragments.map(trimFragment);
  const lead = isTaskLabel
    ? [
        ...children.slice(0, LABEL_OPENING_TOKENS),
        ...first,
        ...children.slice(labelEnd),
      ]
    : first;
  return [lead, ...rest].filter((part) => part.length > 0);
}

// The editor would split a paragraph around a block image itself and keep the
// empty halves as blank lines.
md.core.ruler.push('image-blocks', (state) => {
  const copy = (token: Token, changes: Partial<Token> = {}): Token =>
    Object.assign(
      new state.Token(token.type, token.tag, token.nesting),
      token,
      changes
    );
  const { tokens } = state;
  const split: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx += 1) {
    const [open, inline, close] = [
      tokens[idx],
      tokens[idx + 1],
      tokens[idx + 2],
    ];
    const paragraphs =
      open.type === 'paragraph_open' && inline?.type === 'inline'
        ? paragraphsAroundImages(inline, isTaskListItem(tokens[idx - 1]))
        : null;
    if (!paragraphs) {
      split.push(open);
      continue;
    }
    for (const children of paragraphs) {
      split.push(
        copy(open),
        copy(inline, {
          children,
          content: children.map((child) => child.content).join(''),
        }),
        copy(close)
      );
    }
    idx += 2;
  }
  state.tokens = split;
});

function isBlankText(token: Token | undefined): boolean {
  return token?.type === 'text' && BLANK_TEXT.test(token.content);
}

function withoutBreakPadding(children: Token[], isTaskLabel: boolean): Token[] {
  const last = children.length - 1 - (isTaskLabel ? LABEL_CLOSING_TOKENS : 0);
  const padded =
    isBlankText(children[last]) && children[last - 1]?.type === 'hardbreak';
  return padded ? children.filter((_child, idx) => idx !== last) : children;
}

// CommonMark ignores a hard break that ends a paragraph, so the converter
// writes one above a line of only `&nbsp;`, which stands for no text.
md.core.ruler.push('break-padding', (state) => {
  state.tokens.forEach((token, idx, tokens) => {
    if (token.type === 'inline' && tokens[idx - 1]?.type === 'paragraph_open') {
      token.children = withoutBreakPadding(
        token.children ?? [],
        isTaskListItem(tokens[idx - 2])
      );
    }
  });
});

const defaultFence = md.renderer.rules.fence;

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];

  if (token.info.trim() === MERMAID_LANGUAGE) {
    const code = md.utils.escapeHtml(
      token.content.replace(TRAILING_NEWLINES, '')
    );
    return `<div data-mermaid-block data-code="${code}"></div>`;
  }

  // The fence syntax ends the code's last line with a newline that is not
  // part of the code; the editor would keep it as an empty last line.
  token.content = token.content.replace(FENCE_NEWLINE, '');

  return defaultFence
    ? defaultFence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

/**
 * Converts Markdown content to HTML compatible with the Tiptap editor.
 *
 * Supports CommonMark + GFM tables plus:
 * - Task lists: `- [ ] todo` / `- [x] done`
 * - Underline: `++text++` → `<u>text</u>`
 * - Highlight: `==text==` → `<mark>text</mark>`
 * - Superscript: `^text^` → `<sup>text</sup>`
 * - Subscript: `~text~` → `<sub>text</sub>`
 * - Mermaid diagrams: ```` ```mermaid ... ``` ```` → `<div data-mermaid-block data-code="...">`
 * - Images: `![alt](src "caption")` → `<figure data-image><img><figcaption>`
 */
export function markdownToHtml(markdown: string): string {
  return rewriteTaskListFormat(md.render(markdown));
}
