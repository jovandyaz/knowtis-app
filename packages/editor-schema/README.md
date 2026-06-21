# @knowtis/editor-schema

The shared Tiptap/Yjs editor schema layer. It defines the node schema, semantic extensions, and the CRDT field name that the frontend editor **and** the collaboration server must agree on. ~11 consumers.

Import via the `@knowtis/editor-schema` alias (`tsconfig.base.json`):

```ts
import {
  createSemanticExtensions,
  MermaidBlockNode,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';
```

## Key exports

| Export                                          | Purpose                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `YJS_XML_FRAGMENT_NAME`                         | Name of the shared Yjs XML fragment — load-bearing CRDT invariant (see below) |
| `MermaidBlockNode`                              | Tiptap node for Mermaid diagram blocks (`MERMAID_BLOCK_NAME`)                 |
| `MERMAID_VIEW_MODE` / `MermaidViewMode`         | Mermaid block view modes (`code` / `preview` / `split`)                       |
| `createSemanticExtensions`                      | Factory for the shared set of semantic Tiptap extensions                      |
| `isTrivialFragment` / `isTrivialProseMirrorDoc` | Guards for detecting empty/placeholder editor content                         |

## `YJS_XML_FRAGMENT_NAME` — CRDT invariant

```ts
export const YJS_XML_FRAGMENT_NAME = 'content' as const;
```

This is the key under which the document's ProseMirror content is stored inside the Yjs document (`ydoc.getXmlFragment(YJS_XML_FRAGMENT_NAME)`). The browser editor binding and the Hocuspocus collaboration server **must use the same fragment name** — a mismatch silently breaks sync (each side reads/writes a different fragment, so edits never converge). Always import this constant; never hardcode the `'content'` string on either side.

## Running unit tests

Run `nx test editor-schema` to execute the unit tests via [Vitest](https://vitest.dev/).
