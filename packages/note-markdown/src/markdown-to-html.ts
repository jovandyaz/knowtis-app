/// <reference path="./types/markdown-it-plugins.d.ts" />
import MarkdownIt from 'markdown-it';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';

const MERMAID_LANGUAGE = 'mermaid';

/** How a ```mermaid fence renders: the editor's diagram block, or a plain code
 *  block for a surface that cannot draw one (the copilot's chat card). */
export type MermaidRendering = 'block' | 'fence';

export interface MarkdownToHtmlOptions {
  readonly mermaid?: MermaidRendering;
}

interface RenderEnv {
  readonly mermaid: MermaidRendering;
}

const TASK_LIST_UL_PATTERN = /<ul class="contains-task-list">/g;
const TASK_LIST_ITEM_PATTERN =
  /<li class="task-list-item[^"]*"><label><input class="task-list-item-checkbox"( checked="")?[^>]*>\s*([\s\S]*?)<\/label>/g;

/**
 * Rewrites markdown-it-task-lists output to the format Tiptap's TaskList/TaskItem expects.
 *
 * markdown-it emits: `<ul class="contains-task-list"><li class="task-list-item"><label><input [checked]>...</label></li></ul>`
 * Tiptap expects:    `<ul data-type="taskList"><li data-type="taskItem" data-checked="true|false"><p>...</p></li></ul>`
 *
 * A nested sublist sits between `</label>` and `</li>`, so the rewrite stops at
 * `</label>` and leaves the item's own `</li>` in place; consuming it would make
 * the parent swallow its children.
 */
function rewriteTaskListFormat(html: string): string {
  return html
    .replace(TASK_LIST_UL_PATTERN, '<ul data-type="taskList">')
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

md.renderer.rules.fence = (tokens, idx, options, env: RenderEnv, self) => {
  const token = tokens[idx];

  if (env.mermaid === 'block' && token.info.trim() === MERMAID_LANGUAGE) {
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
 * - Mermaid diagrams: ```` ```mermaid ... ``` ```` → `<div data-mermaid-block data-code="...">`,
 *   or a plain fenced code block with `{ mermaid: 'fence' }`
 */
export function markdownToHtml(
  markdown: string,
  options: MarkdownToHtmlOptions = {}
): string {
  const env: RenderEnv = { mermaid: options.mermaid ?? 'block' };
  return rewriteTaskListFormat(md.render(markdown, env));
}
