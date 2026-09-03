# @knowtis/editor

Tiptap editor pieces shared by `apps/notes`: the extension set built on `@knowtis/editor-schema`, custom node views, AI-driven extensions and the toolbar/status components. Source-only workspace library (`type:ui`), imported via the `@knowtis/editor` alias.

## Public API

Everything below is exported from [`src/index.ts`](src/index.ts).

### Extensions

| Export                                                                                                                                                            | Purpose                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBaseExtensions({ openLinksOnClick?, disableHistory? })`                                                                                                    | `createSemanticExtensions` from `@knowtis/editor-schema` with React node views for `codeBlock` and `mermaidBlock`, plus `Placeholder` and `MarkdownPaste`                     |
| `MarkdownPaste`                                                                                                                                                   | Detects Markdown in pasted plain text and converts it with `markdown-it`                                                                                                      |
| `CodeBlockView`, `lowlight`                                                                                                                                       | Code block node view; `lowlight` is `createLowlight(common)`                                                                                                                  |
| `MermaidBlockView`                                                                                                                                                | Mermaid diagram node view                                                                                                                                                     |
| `GhostText` (+ `GhostTextOptions`, `GhostTextProvider`, `GhostTextStreamInput`, `GhostTextStreamChunk`)                                                           | Inline autocomplete: the host injects a `provider` that streams completions; debounce, min length and gating are options                                                      |
| `AIBlockNode`, `AI_BLOCK_STATUS` (+ `AIBlockOptions`, `AIBlockProvider`, `AIBlockStatus`)                                                                         | Block node for inline AI generation with statuses `input`, `streaming`, `done`, `error`                                                                                       |
| `SuggestionMenu` (+ `SuggestionMenuOptions`)                                                                                                                      | Plumbing around `@tiptap/suggestion`; the host supplies the `suggestion` config (char, items, render, command)                                                                |
| `ImageNode`, `ImageUpload`, `extractImageFiles`, `ACCEPTED_IMAGE_TYPES` (+ `ImageAttributes`, `ImageUploadProvider`, `ImageUploadOptions`, `UploadedImageResult`) | Image node and paste/drop upload through a host-provided uploader                                                                                                             |
| `CollaborativeCursors`                                                                                                                                            | Tiptap extension that renders remote cursors from Yjs awareness; sets the local `user` field on create and the `cursor` field to `{ anchor, head }` on every selection change |

### Components

| Export                                 | Purpose                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `CollaborationIndicator`               | Badge listing connected `CollaborativeUser`s (type from `@knowtis/crdt`)  |
| `EditorErrorBoundary`                  | Error boundary around the editor                                          |
| `EditorToolbar`                        | Formatting toolbar; optional `onVoiceNote`, `onAskAI`, `onAddImage` hooks |
| `ReadOnlyEditor`                       | Non-editable Tiptap instance rendering HTML `content`                     |
| `SaveStatusIndicator` (+ `SaveStatus`) | `saving` / `saved` indicator                                              |
| `TableControls`                        | Floating row/column controls for the active table                         |

### Utilities

- `shouldPropagateUpdate({ isInitializing, isSynced })` — gate for forwarding Tiptap `onUpdate` to autosave; false while seeding the Y.Doc or before the provider has synced, so a transient empty document never overwrites the stored note.

## Relationship to other packages

- `@knowtis/editor-schema` owns the semantic node/mark set (`createSemanticExtensions`, `MERMAID_BLOCK_NAME`); this package adds views and behavior on top.
- `@knowtis/crdt` owns the Yjs document, awareness helpers (`getRemoteUserStates`, `createUserDecorations`) and the `user` awareness shape; `CollaborativeCursors` consumes them.
- The Hocuspocus connection and the AI/agent providers are wired in `apps/notes`.

## Testing

```bash
nx test editor    # @nx/vitest:test
```
