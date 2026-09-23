# @knowtis/editor

Tiptap editor pieces shared by `apps/notes`: the extension set built on `@knowtis/editor-schema`, custom node views, AI-driven extensions and the toolbar/status components. Source-only workspace library (`type:ui`), imported via the `@knowtis/editor` alias.

## Public API

Everything below is exported from [`src/index.ts`](src/index.ts).

### Extensions

| Export                                                                                                                            | Purpose                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBaseExtensions({ openLinksOnClick?, disableHistory?, aiBlockProvider? })` (+ `AIBlockProvider`)                            | `createSemanticExtensions` from `@knowtis/editor-schema` with React node views for `codeBlock`, `mermaidBlock`, `image` and `aiBlock`, plus `Placeholder` and `MarkdownPaste`. `aiBlockProvider` streams the AI block's generation; without one the block shows its error state |
| `MarkdownPaste`                                                                                                                   | Detects Markdown in pasted plain text and converts it with `markdown-it`                                                                                                                                                                                                        |
| `CodeBlockView`, `lowlight`                                                                                                       | Code block node view; `lowlight` is `createLowlight(common)`                                                                                                                                                                                                                    |
| `MermaidBlockView`                                                                                                                | Mermaid diagram node view                                                                                                                                                                                                                                                       |
| `GhostText` (+ `GhostTextOptions`, `GhostTextProvider`, `GhostTextStreamInput`, `GhostTextStreamChunk`)                           | Inline autocomplete: the host injects a `provider` that streams completions; debounce, min length and gating are options                                                                                                                                                        |
| `SuggestionMenu` (+ `SuggestionMenuOptions`)                                                                                      | Plumbing around `@tiptap/suggestion`; the host supplies the `suggestion` config (char, items, render, command)                                                                                                                                                                  |
| `ImageUpload`, `extractImageFiles`, `ACCEPTED_IMAGE_TYPES` (+ `ImageUploadProvider`, `ImageUploadOptions`, `UploadedImageResult`) | Paste/drop image upload through a host-provided uploader (the node itself is `ImageNode` from `@knowtis/editor-schema`)                                                                                                                                                         |
| `CollaborativeCursors`                                                                                                            | Tiptap extension that renders remote cursors from Yjs awareness; sets the local `user` field on create and the `cursor` field to `{ anchor, head }` on every selection change                                                                                                   |

### Components

| Export                                 | Purpose                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `CollaborationIndicator`               | Badge listing connected `CollaborativeUser`s (type from `@knowtis/crdt`)  |
| `EditorErrorBoundary`                  | Error boundary around the editor                                          |
| `EditorToolbar`                        | Formatting toolbar; optional `onVoiceNote`, `onAskAI`, `onAddImage` hooks |
| `ReadOnlyEditor`                       | Non-editable Tiptap instance rendering HTML `content`                     |
| `SaveStatusIndicator` (+ `SaveStatus`) | `pending` / `saving` / `saved` / `error` indicator                        |
| `TableControls`                        | Floating row/column controls for the active table                         |

### Utilities

- `shouldPropagateUpdate({ isInitializing, isSynced })` — gate for forwarding Tiptap `onUpdate` to autosave; false while seeding the Y.Doc or before the provider has synced, so a transient empty document never overwrites the stored note.
- `createAiHtmlPurifier()`, `AI_HTML_PURIFY_CONFIG` — the DOMPurify instance and allowlist every sanitizer of LLM-shaped HTML uses (`markdownToFragment` here, `sanitizeAiHtml`/`sanitizeProposalHtml` in `apps/notes`). Only the elements and attributes the note schema reads survive, images excluded (a sanitizer that keeps stored images adds them); a mermaid block's `data-code` stays whole, arrows included.

## Relationship to other packages

- `@knowtis/editor-schema` owns the semantic node/mark set (`createSemanticExtensions`, `MERMAID_BLOCK_NAME`, `AIBlockNode`); this package adds views and behavior on top.
- `@knowtis/crdt` owns the Yjs document, awareness helpers (`getRemoteUserStates`, `createUserDecorations`) and the `user` awareness shape; `CollaborativeCursors` consumes them.
- The Hocuspocus connection and the AI/agent providers are wired in `apps/notes`.

## Testing

```bash
nx test editor    # @nx/vitest:test
```
