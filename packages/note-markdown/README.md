# @knowtis/note-markdown

Markdown ⇄ Tiptap-HTML conversion for the note body, shared by the MCP server (`apps/mcp`) and the API's copilot proposals (`apps/api`). Both sides must agree on one dialect, so there is one implementation.

There is no `package.json`; the package exists as the `@knowtis/note-markdown` alias in `tsconfig.base.json`:

```ts
import { htmlToMarkdown, markdownToHtml } from '@knowtis/note-markdown';
```

## Exports

| Export                               | Purpose                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdownToHtml(markdown, options?)` | CommonMark + GFM tables, task lists (`- [ ]`), `==mark==`, `^sup^`, `~sub~`, linkify; a ` ```mermaid ``` ` fence becomes the editor's diagram block (`<div data-mermaid-block data-code>`), or a plain code block with `{ mermaid: 'fence' }` |
| `htmlToMarkdown(html)`               | Inverse for editor-produced HTML: task lists, marks, mermaid blocks and GFM tables survive a round trip; literal `~`, `^`, `==` are escaped so they stay literal                                                                              |

The output is **not** sanitized. The MCP writes it through the authenticated notes API; the API's agent sanitizer (`apps/api/src/modules/agent/infrastructure/sanitize/html-sanitizer.ts`) allowlists it before it becomes a proposal.

## Untyped dependencies

`markdown-it-task-lists`, `-mark`, `-sub`, `-sup` and `turndown-plugin-gfm` ship no types. Their declarations live in `src/types/*.d.ts` and reach every consumer's program through the `/// <reference path>` directive at the top of the module that imports them — a source-only package has no other way to hand them over.

## Tests

`pnpm nx test note-markdown`
