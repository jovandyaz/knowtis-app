import MarkdownIt from 'markdown-it';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';

const MERMAID_LANGUAGE = 'mermaid';

const TASK_LIST_UL_PATTERN = /<ul class="contains-task-list">/g;
const TASK_LIST_ITEM_PATTERN =
  /<li class="task-list-item[^"]*"><label><input class="task-list-item-checkbox"( checked="")?[^>]*>\s*([\s\S]*?)<\/label><\/li>/g;

/**
 * Rewrites markdown-it-task-lists output to the format Tiptap's TaskList/TaskItem expects.
 *
 * markdown-it emits: `<ul class="contains-task-list"><li class="task-list-item"><label><input [checked]>...</label></li></ul>`
 * Tiptap expects:    `<ul data-type="taskList"><li data-type="taskItem" data-checked="true|false"><p>...</p></li></ul>`
 */
function rewriteTaskListFormat(html: string): string {
  return html
    .replace(TASK_LIST_UL_PATTERN, '<ul data-type="taskList">')
    .replace(TASK_LIST_ITEM_PATTERN, (_match, checkedAttr, content) => {
      const checked = checkedAttr ? 'true' : 'false';
      return `<li data-type="taskItem" data-checked="${checked}"><p>${content.trim()}</p></li>`;
    });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const language = token.info.trim();

  if (language === MERMAID_LANGUAGE) {
    const code = escapeHtml(token.content);
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
