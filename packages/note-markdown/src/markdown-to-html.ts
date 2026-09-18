/// <reference path="./types/markdown-it-plugins.d.ts" />
import MarkdownIt from 'markdown-it';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';

const MERMAID_LANGUAGE = 'mermaid';

const TASK_LIST_UL_PATTERN = /<ul class="contains-task-list">/g;
const LOOSE_TASK_ITEM_PATTERN =
  /(<li class="task-list-item[^"]*">)\s*<p>(<label><input class="task-list-item-checkbox"[^>]*>[\s\S]*?<\/label>)<\/p>/g;
const TASK_LIST_ITEM_PATTERN =
  /<li class="task-list-item[^"]*"><label><input class="task-list-item-checkbox"( checked="")?[^>]*>\s*([\s\S]*?)<\/label>/g;

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
      return `<li data-type="taskItem" data-checked="${checked}"><p>${content.trim()}</p>`;
    });
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

md.use(markdownItTaskLists, { enabled: true, label: true });
md.use(markdownItMark);
md.use(markdownItSup);
md.use(markdownItSub);

const defaultFence = md.renderer.rules.fence;

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];

  if (token.info.trim() === MERMAID_LANGUAGE) {
    const code = md.utils.escapeHtml(token.content);
    return `<div data-mermaid-block data-code="${code}"></div>`;
  }

  return defaultFence
    ? defaultFence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

/**
 * Converts Markdown content to HTML compatible with the Tiptap editor.
 *
 * Supports CommonMark + GFM tables plus:
 * - Task lists: `- [ ] todo` / `- [x] done`
 * - Highlight: `==text==` → `<mark>text</mark>`
 * - Superscript: `^text^` → `<sup>text</sup>`
 * - Subscript: `~text~` → `<sub>text</sub>`
 * - Mermaid diagrams: ```` ```mermaid ... ``` ```` → `<div data-mermaid-block data-code="...">`
 */
export function markdownToHtml(markdown: string): string {
  return rewriteTaskListFormat(md.render(markdown));
}
