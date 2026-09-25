# @knowtis/editor-schema

The shared Tiptap/Yjs editor schema layer. It defines the node schema, semantic extensions, and the CRDT field name that the frontend editor **and** the collaboration server must agree on. Consumed by `apps/notes`, `apps/api`, `apps/mcp`, `packages/editor` and `packages/crdt`.

There is no `package.json`; the package exists only as the `@knowtis/editor-schema` and `@knowtis/editor-schema/server` aliases in `tsconfig.base.json`:

```ts
import {
  createSemanticExtensions,
  MermaidBlockNode,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';
```

## Key exports

| Export                                                                                  | Purpose                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YJS_XML_FRAGMENT_NAME`                                                                 | Name of the shared Yjs XML fragment — load-bearing CRDT invariant (see below)                                                                                                                                                           |
| `MermaidBlockNode`, `MERMAID_BLOCK_NAME`, `MERMAID_BLOCK_ATTR`, `MERMAID_CODE_ATTR`     | Tiptap node for Mermaid diagram blocks; `MERMAID_BLOCK_NAME = 'mermaidBlock'`. It parses `div[data-mermaid-block]` (`MERMAID_BLOCK_ATTR`) and keeps the diagram source in `data-code` (`MERMAID_CODE_ATTR`)                             |
| `MERMAID_VIEW_MODE` / `MermaidViewMode`                                                 | Mermaid block view modes (`code` / `preview` / `split`)                                                                                                                                                                                 |
| `ImageNode`, `IMAGE_NODE_NAME`, `IMAGE_FIGURE_ATTRIBUTE`, `ImageAttributes`             | Block image node: `figure[data-image] > img + figcaption`; the caption is the node's inline content. The browser attaches its node view in `@knowtis/editor`                                                                            |
| `IMAGE_SRC_ATTR`, `isForeignImage`                                                      | The image node's `src` attribute name, and whether an image node's `src` is off the app's blob store host (`isStoredImageUrl`): content no server-side write keeps                                                                      |
| `AIBlockNode`, `AI_BLOCK_NAME`, `AI_BLOCK_STATUS`, `AIBlockStatus`, `AIBlockAttributes` | Atom block for inline AI generation: `div[data-ai-block]` with `topic`, `status`, `content` and `errorMessage` attributes; its generated text lives in the `content` attribute. The browser attaches its node view in `@knowtis/editor` |
| `createSemanticExtensions`                                                              | Factory for the shared set of semantic Tiptap extensions                                                                                                                                                                                |
| `HIGHLIGHT_MARK_NAME`                                                                   | Name of the highlight mark. Its `color` is kept only as a hex value (`#rgb` or `#rrggbb`), both when HTML is parsed and when the mark renders, because Tiptap writes it into a `style` attribute                                        |
| `SemanticExtensionsOptions`, `NodeAttributeClasses`                                     | Options type for the factory and the per-node CSS class map it accepts                                                                                                                                                                  |
| `isTrivialFragment` / `isTrivialProseMirrorDoc`                                         | Guards for detecting empty/placeholder editor content                                                                                                                                                                                   |

## Server entry: `@knowtis/editor-schema/server`

Helpers that parse or render a stored note's HTML through `@tiptap/html/server`, which needs `happy-dom`. Only Node code imports this entry (`apps/api`, `apps/mcp`); the browser never loads it.

| Export                                                                              | Purpose                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noteSchemaExtensions`                                                              | The extensions every server-side reader and writer parses and renders a stored note with                                                                                          |
| `nodesLostBetween`                                                                  | Node and mark types a document would hold fewer of after `after` replaces `before`: the fidelity guard for writes rebuilt from Markdown                                           |
| `NODES_WITHOUT_MARKDOWN`, `nodesWithoutMarkdown`, `nodesWithoutMarkdownLostBetween` | The node types Markdown has no form for (today the AI block), and the ones among them a rewrite from Markdown would drop: its writer never saw them, so such a rewrite is refused |
| `restoreStoredAttributes`                                                           | Copies the attributes Markdown drops (image `width`/`height`, highlight `color`, diagram `viewMode`) from the stored HTML onto HTML rebuilt from Markdown, keyed by content       |

## `YJS_XML_FRAGMENT_NAME` — CRDT invariant

```ts
export const YJS_XML_FRAGMENT_NAME = 'content' as const;
```

This is the key under which the document's ProseMirror content is stored inside the Yjs document (`ydoc.getXmlFragment(YJS_XML_FRAGMENT_NAME)`). The browser editor binding and the Hocuspocus collaboration server **must use the same fragment name** — a mismatch silently breaks sync (each side reads/writes a different fragment, so edits never converge). Always import this constant; never hardcode the `'content'` string on either side.

## Running unit tests

Run `nx test editor-schema` to execute the unit tests via [Vitest](https://vitest.dev/).
