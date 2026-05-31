# Editor Image Upload — Design

**Date:** 2026-05-30
**Status:** Approved (design) — pending spec review
**Scope:** v1 image support in the collaborative Tiptap editor (notes app)

## Context

Knowtis notes have no way to embed images. Users expect the modern "paste or
drop" flow (GitHub PR description / Linear / Notion): paste from clipboard or
drag a file into the editor, see an instant placeholder, and have the image
swap in once uploaded — no modal, no extra steps. On mobile (the app is
mobile-first) paste/drop is not enough, so we also expose a slash command and a
toolbar button that open the native file/camera picker.

Storage targets the **Vercel Blob Hobby (free) tier**: 5 GB storage, 100 GB
transfer/mo, 10K advanced ops/mo, shared across the project. Client-side
compression keeps us comfortably inside those limits. On Hobby there are no
overage charges — Blob simply blocks for 30 days if exceeded — so cost risk is
zero, but we still optimize to avoid hitting the wall.

## Decisions (locked)

| Axis              | Decision                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Entry points      | Paste + drag/drop + slash `/imagen` + toolbar button                                                                             |
| Client processing | Resize longest side → ~1600px, encode WebP/JPEG ~0.8; **GIF passes through untouched**; input ≤ 10 MB; accept png/jpg/gif/webp   |
| Inserted node     | insert / select / delete + optional **caption** (figcaption) + **editable alt**; no resize/align in v1                           |
| Transport         | **Server upload** through NestJS (single multipart request)                                                                      |
| Blob access       | **Public** blobs, unguessable random suffix, path `notes/{noteId}/{random}.{ext}`                                                |
| Collaboration     | Placeholder is a **local-only** ProseMirror decoration; only the final image node (with public URL) is inserted into the Yjs doc |

## Architecture

Data flows browser → NestJS (Railway) → Vercel Blob, with the final URL synced
to collaborators via the existing Yjs/Hocuspocus pipeline.

```
[Editor paste/drop/slash/toolbar]
      │  File
      ▼
[client compress+resize]  canvas.toBlob('image/webp', 0.8)   (skip for gif)
      │  Blob (~100–500 KB)
      ▼
[local placeholder decoration]  (ProseMirror, NOT synced)
      │  multipart FormData
      ▼
POST /api/v1/notes/:noteId/images   (httpClient auto-detects FormData, injects JWT)
      │
      ▼
[NestJS NotesController (POST :id/images)]
  - JwtAuthGuard + PoliciesGuard → require write access to :noteId
  - ParseFilePipe (MaxFileSize, FileType image/*)
  - @vercel/blob put(path, buffer, { access:'public', addRandomSuffix:true })
  - insert row into note_images
  - returns { url, pathname, width, height, mimeType }
      │  { url, ... }
      ▼
[editor] replace decoration → insert `image` node with src=url
      │
      ▼
[Yjs doc updates → Hocuspocus → collaborators see finished image]
```

### Frontend — editor (`packages/editor`)

New folder `packages/editor/src/extensions/image/`:

- **`ImageNode.ts`** — custom block node `image`. Attrs: `src`, `alt`, `width`,
  `height`. Content holds the inline caption (figure → figcaption pattern), so
  the caption is real editable ProseMirror content. `parseHTML`/`renderHTML`
  emit `<figure><img><figcaption></figure>` so `editor.getHTML()` persists
  correctly through the existing HTML save path.
- **`ImageView.tsx`** — `ReactNodeViewRenderer` (mirrors `AIBlockView`). Renders
  the `<img>`, the editable caption (`NodeViewContent`), and a floating toolbar
  on selection: edit **alt** (small popover/input), **replace**, **delete**.
- **`image-upload.ts`** — ProseMirror plugin with `handlePaste` and `handleDrop`
  (mirrors `markdown-paste.ts`). Responsibilities: detect image files, render a
  **local decoration** placeholder with progress, call the injected
  `uploadImage` provider, then replace the decoration with a real `image` node
  in one transaction. On failure: remove decoration + toast. A drag-over
  decoration paints the "Suelta para subir" overlay.
- Upload logic is injected via an **`imageUploadProvider`** option (same pattern
  as `aiBlockProvider` / `ghostTextProvider`) so the editor package stays
  decoupled from `api-client`. The provider signature:
  `(file: File, signal: AbortSignal) => Promise<{src; width; height; alt}>`.

### Frontend — wiring (`apps/notes`)

- **`useEditorExtensions.ts`** — register `ImageNode.configure({ provider })`
  and the upload plugin. The provider runs client compression then calls the
  data-access hook.
- **Client compression util** (`apps/notes/src/components/editor/image/compress.ts`)
  — dependency-free Canvas: load into `Image`, draw to `<canvas>` scaled to
  ≤1600px, `canvas.toBlob('image/webp', 0.8)`. Skip entirely for `image/gif`
  (keep animation). Falls back to original blob if canvas/WebP unsupported.
- **Slash command** — add `image` entry to `FORMATTING_SLASH_COMMANDS`
  (`slash-commands.config.ts`); action opens a hidden `<input type="file">`.
- **Toolbar button** — add `{ icon: ImageIcon, ... }` to `TOOLBAR_TOOLS`
  (`editor.config.ts`); same file-picker action.

### Frontend — data layer

- **`libs/api-client/src/lib/images.api.ts`** — `imagesApi.upload(noteId, formData)`
  → `httpClient.post('/notes/:noteId/images', formData)`. FormData is already
  auto-detected by `http-client.ts` (skips JSON, lets the browser set the
  multipart boundary); JWT is auto-injected. Returns the upload response type.
- **`libs/data-access/notes/src/image-upload.hooks.ts`** — `useUploadImage()`
  mutation following the existing hook pattern; surfaces errors via `sonner`
  toast. (No optimistic cache write needed — the editor owns the placeholder.)
- Zod response schema (`ImageUploadResponse`) colocated with the hook types.

### Backend — NestJS (`apps/api`)

Inside the existing **notes module** (cohesive with notes; avoids a circular
dependency for permission checks and delete-cleanup), following the DDD layout:

- **`NotesController` — `POST /notes/:id/images`** (new endpoint on the existing controller)
  - Guards: `JwtAuthGuard`, `PoliciesGuard` with `@RequirePermission('update', SUBJECTS.Note)`; verify the user can write `:noteId` (reuse the notes permission repository / `hasAccess`).
  - `@UseInterceptors(FileInterceptor('file'))` + `ParseFilePipe`
    (`MaxFileSizeValidator` ~10 MB, `FileTypeValidator /^image\/(png|jpe?g|gif|webp)$/`) — same shape as `ai.controller.ts` voice-note.
  - Swagger decorators consistent with `notes.controller.ts`.
- **Application handler** — `upload-image.handler.ts`: calls the Blob port,
  persists a `note_images` row, returns metadata.
- **Infrastructure** — `VercelBlobStorage` adapter wrapping `@vercel/blob`
  `put()` / `del()`; `access:'public'`, `addRandomSuffix:true`,
  path `notes/${noteId}/${filename}`. Reads token from `ConfigService`.
- **DB** — new Drizzle table `note_images`:
  `id, noteId (fk→notes, cascade), userId (fk→users), pathname, url, size, mimeType, width, height, createdAt`. Migration via `pnpm db:push`.
- **Env** — add `VERCEL_BLOB_READ_WRITE_TOKEN: z.string().optional()` to
  `apps/api/src/config/env.config.ts` and document it in `apps/api/.env.example`
  (AI section). Provide it in Railway env vars.

## Performance

- Client compression cuts typical phone photos from 3–8 MB to ~150–400 KB →
  fast upload, fast render, light storage. ~12K compressed images fit in 5 GB.
- Public blobs are served **directly from the Blob CDN** to every viewer/
  collaborator (no function in the hot path). Cache HITs cost nothing.
- Width/height stored and set on `<img>` to reserve layout space (no CLS).
- Upload is async/optimistic; typing is never blocked.

## Error handling

- Compression failure → upload original (logged); never block the user.
- Validation reject (size/type) → 400 from NestJS → toast, remove placeholder.
- Network/upload failure → toast with retry affordance, remove placeholder.
- Note left mid-upload → local decoration is discarded; no partial node syncs.
- Abort via `AbortSignal` when the placeholder is removed.

## Security

- Token (`VERCEL_BLOB_READ_WRITE_TOKEN`) lives only in the NestJS/Railway env;
  never shipped to the browser.
- Write authorization enforced server-side against `:noteId` before any `put()`.
- MIME + size validated server-side (client checks are UX only).
- Public URLs use a random suffix (unguessable); no directory listing exposed.

## Orphan cleanup

- **Note deleted** → hook the existing delete-note flow to `del()` all
  `note_images` pathnames for that note (DB rows cascade).
- **Image removed from content (in-note)** → out of scope for v1. The
  `note_images` table is the source of truth for a future scheduled
  reconciliation job (diff DB pathnames vs URLs present in note HTML/Yjs).
  Documented as a known limitation; storage impact is bounded by Hobby limits.

## Out of scope (v1)

Resize handles, alignment, image galleries/lightbox, client-upload transport,
thumbnail generation, in-note orphan reconciliation, non-image files.

## Testing / verification

- **Unit**: compression util (resize math, gif passthrough, fallback);
  ProseMirror plugin (paste/drop detect, decoration lifecycle); NestJS
  `ParseFilePipe` validation + permission guard (reject non-writer).
- **Integration**: `POST /notes/:id/images` happy path + 403 for non-writer +
  400 for oversized/wrong-type (mirror voice-note tests).
- **Manual E2E** (`pnpm dev:all`, Docker up): paste an image → placeholder →
  final render; drag/drop; slash `/imagen`; toolbar button on a mobile
  viewport; add caption + alt; open the same note as a second user and confirm
  only the finished image appears (no broken `blob:` URL); delete the note and
  confirm blobs are removed (Blob dashboard / `list()`).
- Verify env wiring: missing token → clear startup/handler error, not a silent
  failure.
