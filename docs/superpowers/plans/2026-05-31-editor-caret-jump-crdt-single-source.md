# Editor Caret-Jump Fix — CRDT Single-Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the editor caret from jumping to the end of the document after every autosave by making the live CRDT the single source of truth for content while collaborating.

**Architecture:** While a client is live-collaborating (WebSocket connected + synced), it stops sending the REST `{ content }` autosave, so the server never emits the `NoteUpdatedEvent` whose `applyExternalUpdate` clear-and-rebuild echoes a destructive delta back to the originating editor. To keep the canonical HTML `content` column fresh, the Hocuspocus persistence extension now derives HTML from the live Y.Doc inside `onStoreDocument`. The non-collaborative path (WS disabled / pre-sync) keeps the REST autosave unchanged.

**Tech Stack:** React 19, Tiptap v3 + `@tiptap/react`, Yjs + `@hocuspocus/provider`/`@hocuspocus/server` v4, `y-prosemirror`, `@tiptap/html/server`, NestJS 11, Drizzle, neverthrow, Vitest.

---

## Problem & Root Cause (verified from code)

Symptom: ~0.5s after you stop typing (the `AUTO_SAVE = 500ms` debounce), the caret jumps to the end of the document — every save, any line. It predates the image-upload feature.

The self-inflicted destructive echo:

1. Content change → debounced REST `PATCH /notes/:id` `{ content }` (`apps/notes/src/pages/NoteEditorPage.tsx` `handleContentChange`).
2. `UpdateNoteHandler` converts HTML → `yjsState` and emits `NoteUpdatedEvent` (`apps/api/src/modules/notes/application/commands/update-note.handler.ts`).
3. `NoteUpdatedListener` → `HocuspocusService.applyExternalUpdate` (`apps/api/src/modules/collaboration/listeners/note-updated.listener.ts`).
4. Because the editor is connected, `mergeIntoLiveDocument` runs `fragment.delete(0, fragment.length); Y.applyUpdate(doc, yjsState)` (`apps/api/src/modules/collaboration/hocuspocus.service.ts:257-261`) — wipes every node and rebuilds.
5. Hocuspocus fans the delta back to the originating client (no origin filtering). y-prosemirror cannot remap the selection onto deleted nodes → ProseMirror collapses the caret to the doc end.

The live Y.Doc already contains the user's own edits, so the REST content write + broadcast is redundant and destructive. `applyExternalUpdate` remains correct and untouched for genuinely external writes (MCP / non-live REST clients).

**Why the chosen design is safe:** `shouldPropagateUpdate` (`packages/editor/src/shouldPropagateUpdate.ts:17`) returns `!isInitializing && isSynced`, so the page's `handleContentChange` only fires once the WS doc is synced. Thus gating the content REST write on `wsEnabled && isSynced` introduces no pre-sync data-loss window. Live notes hydrate the editor from `yjsState` via `onLoadDocument`, so the (now lazily-updated) HTML `content` column is never used to seed a live editor — content-column lag (the `onStoreDocument` 2s/10s debounce) is cosmetic for previews/search/MCP only. First-load of legacy notes without stored `yjsState` still seeds from `initialContent` (unchanged).

---

## File Structure

| File                                                                                     | Responsibility              | Change                                                                                                      |
| ---------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/notes/infrastructure/html-to-yjs.ts`                               | HTML↔Yjs conversion.        | **Add** `yDocToHtml(doc)` — inverse of `htmlToYjsState`.                                                    |
| `apps/api/src/modules/notes/infrastructure/html-to-yjs.spec.ts`                          | Converter tests.            | **Add** round-trip + empty-paragraph cases.                                                                 |
| `apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.ts`      | Yjs load/store persistence. | **Modify** `onStoreDocument` to persist derived HTML `content` + `yjsState`, with a yjsState-only fallback. |
| `apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.spec.ts` | Persistence tests.          | **Modify** store test; **add** fallback test.                                                               |
| `apps/notes/src/components/editor/CollaborativeEditor.types.ts`                          | Editor prop types.          | **Add** `onLiveCollaborationChange?` prop.                                                                  |
| `apps/notes/src/components/editor/CollaborativeEditor.tsx`                               | Collaboration wiring.       | **Add** effect firing `onLiveCollaborationChange(wsEnabled && isSynced)`.                                   |
| `apps/notes/src/pages/NoteEditorPage.tsx`                                                | Note page + autosave.       | **Gate** the `{ content }` REST write on `!isLiveCollabRef.current`.                                        |

Untouched on purpose: `hocuspocus.service.ts`, `update-note.handler.ts`, `note-updated.listener.ts`.

---

## Task 1: Server — `yDocToHtml` converter (inverse of `htmlToYjsState`)

**Files:**

- Modify: `apps/api/src/modules/notes/infrastructure/html-to-yjs.ts`
- Test: `apps/api/src/modules/notes/infrastructure/html-to-yjs.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/modules/notes/infrastructure/html-to-yjs.spec.ts`:

```ts
import * as Y from 'yjs';

import { htmlToYjsState, yDocToHtml } from './html-to-yjs';

describe('yDocToHtml', () => {
  it('round-trips html through a Y.Doc back to equivalent html', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(htmlToYjsState(html)));

    const out = yDocToHtml(doc);

    expect(out).toContain('Hello');
    expect(out).toContain('<strong>world</strong>');
  });

  it('produces a paragraph for a single empty paragraph doc', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(htmlToYjsState('<p></p>')));

    expect(yDocToHtml(doc)).toContain('<p>');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `nx test api -- html-to-yjs`
Expected: FAIL — `yDocToHtml is not a function` / not exported.

- [ ] **Step 3: Implement the converter**

Edit `apps/api/src/modules/notes/infrastructure/html-to-yjs.ts` — add the `generateHTML`/`yDocToProsemirrorJSON` imports and the function:

```ts
import { getSchema } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import {
  createSemanticExtensions,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';

const tiptapExtensions = [...createSemanticExtensions()];

export const editorSchema = getSchema(tiptapExtensions);

export function htmlToYjsState(html: string): Buffer {
  const json = generateJSON(html, tiptapExtensions);
  const yDoc = prosemirrorJSONToYDoc(editorSchema, json, YJS_XML_FRAGMENT_NAME);
  const state = Y.encodeStateAsUpdate(yDoc);
  yDoc.destroy();
  return Buffer.from(state);
}

/** Inverse of {@link htmlToYjsState}: renders the live Y.Doc's XML fragment to
 *  the canonical HTML used for previews, search and MCP reads. */
export function yDocToHtml(doc: Y.Doc): string {
  const json = yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME);
  return generateHTML(json, tiptapExtensions);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `nx test api -- html-to-yjs`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notes/infrastructure/html-to-yjs.ts apps/api/src/modules/notes/infrastructure/html-to-yjs.spec.ts
git commit -m "feat(api): add yDocToHtml converter (inverse of htmlToYjsState)"
```

---

## Task 2: Server — persist derived HTML content in `onStoreDocument`

**Files:**

- Modify: `apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.ts`
- Test: `apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.spec.ts`

- [ ] **Step 1: Update the store test + add the fallback test**

In `hocuspocus-persistence.extension.spec.ts`: add a namespace import for the converter at the top:

```ts
import * as htmlToYjs from '../../notes/infrastructure/html-to-yjs';
```

Replace the `should persist Y.Doc state on store` test body with:

```ts
it('should persist derived HTML content and yjsState on store', async () => {
  const updateContentWithYjsState = vi.fn().mockResolvedValue(
    ok({
      id: 'note-1',
      title: 'Test',
      content: '<p>Stored</p>',
      ownerId: 'user-1',
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
      yjsState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
  const repo = { updateContentWithYjsState } as unknown as NoteRepository;

  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('Stored')]);
  fragment.insert(0, [paragraph]);

  const ext = new HocuspocusPersistenceExtension(repo);
  await ext.toExtension().onStoreDocument?.({
    document: doc,
    documentName: 'note-1',
  } as never);

  expect(updateContentWithYjsState).toHaveBeenCalledTimes(1);
  const [calledId, data, buffer] = updateContentWithYjsState.mock.calls[0];
  expect(calledId).toBe('note-1');
  expect(data.content).toContain('Stored');
  expect(Buffer.isBuffer(buffer)).toBe(true);
});

it('falls back to yjsState-only persist when HTML derivation throws', async () => {
  vi.spyOn(htmlToYjs, 'yDocToHtml').mockImplementation(() => {
    throw new Error('boom');
  });
  const updateContentWithYjsState = vi.fn();
  const updateYjsState = vi.fn().mockResolvedValue(
    ok({
      id: 'note-1',
      title: 'Test',
      content: '',
      ownerId: 'user-1',
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
      yjsState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
  const repo = {
    updateContentWithYjsState,
    updateYjsState,
  } as unknown as NoteRepository;

  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('Stored')]);
  fragment.insert(0, [paragraph]);

  const ext = new HocuspocusPersistenceExtension(repo);
  await ext.toExtension().onStoreDocument?.({
    document: doc,
    documentName: 'note-1',
  } as never);

  expect(updateContentWithYjsState).not.toHaveBeenCalled();
  expect(updateYjsState).toHaveBeenCalledTimes(1);

  vi.restoreAllMocks();
});
```

Also update the trivial-skip test to assert BOTH methods are skipped — change its repo mock to:

```ts
const updateContentWithYjsState = vi.fn();
const updateYjsState = vi.fn();
const findById = vi.fn().mockResolvedValue({
  id: 'note-1',
  content: '<p>Real content</p>',
});
const repo = {
  updateContentWithYjsState,
  updateYjsState,
  findById,
} as unknown as NoteRepository;
```

and its assertion to:

```ts
expect(updateContentWithYjsState).not.toHaveBeenCalled();
expect(updateYjsState).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run to verify it fails**

Run: `nx test api -- hocuspocus-persistence`
Expected: FAIL — `updateContentWithYjsState` not called (extension still calls `updateYjsState`).

- [ ] **Step 3: Implement the persistence change**

In `hocuspocus-persistence.extension.ts`, add the import:

```ts
import { yDocToHtml } from '../../notes/infrastructure/html-to-yjs';
```

Replace the persist tail of `onStoreDocument` (the `const state = Y.encodeStateAsUpdate(document); ... updateYjsState(...)` block) with:

```ts
const buffer = Buffer.from(Y.encodeStateAsUpdate(document));

try {
  const html = yDocToHtml(document);
  const result = await noteRepository.updateContentWithYjsState(
    documentName,
    { content: html },
    buffer
  );
  if (result.isErr()) {
    logger.error(
      `Failed to persist content+yjsState for note ${documentName}: ${result.error.message}`
    );
  }
} catch (error) {
  // Never drop the edit: if HTML derivation fails, persist yjsState only.
  logger.warn(
    `yDocToHtml failed for note ${documentName}, persisting yjsState only`,
    error instanceof Error ? error.stack : error
  );
  const result = await noteRepository.updateYjsState(documentName, buffer);
  if (result.isErr()) {
    logger.error(
      `Failed to persist Y.Doc state for note ${documentName}: ${result.error.message}`
    );
  }
}
```

Keep the existing trivial-fragment guard above it unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `nx test api -- hocuspocus-persistence`
Expected: PASS (store persists content+yjsState; fallback persists yjsState; trivial skip persists nothing).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.ts apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.spec.ts
git commit -m "fix(collaboration): persist derived HTML content from live Y.Doc on store"
```

---

## Task 3: Client — suppress REST content autosave while live & synced

**Files:**

- Modify: `apps/notes/src/components/editor/CollaborativeEditor.types.ts`
- Modify: `apps/notes/src/components/editor/CollaborativeEditor.tsx`
- Modify: `apps/notes/src/pages/NoteEditorPage.tsx`

> No unit test: the Tiptap+Yjs editor seam is not meaningfully unit-testable in jsdom and the codebase does not unit-test `CollaborativeEditor`. This task is verified by typecheck/lint here and the Playwright reproduction + manual E2E in Task 4.

- [ ] **Step 1: Add the `onLiveCollaborationChange` prop type**

In `apps/notes/src/components/editor/CollaborativeEditor.types.ts`, inside `CollaborativeEditorProps`, add:

```ts
  /** Fires when live WS collaboration becomes (or stops being) the source of
   *  truth — connected AND synced. The page uses it to suppress the redundant
   *  REST content autosave that otherwise echoes back and resets the caret. */
  onLiveCollaborationChange?: ((isLive: boolean) => void) | undefined;
```

- [ ] **Step 2: Fire the callback from `CollaborativeEditor`**

In `apps/notes/src/components/editor/CollaborativeEditor.tsx`:

Add `onLiveCollaborationChange` to the destructured props of the outer `CollaborativeEditor`:

```ts
export function CollaborativeEditor({
  noteId,
  initialContent,
  onUpdate,
  placeholder,
  className,
  editable = true,
  shareToken,
  onEditDenied,
  autoFocus,
  onEditorReady,
  onVoiceNote,
  localFirst = false,
  onLiveCollaborationChange,
}: CollaborativeEditorProps) {
```

After `wsEnabled` and `isSynced` are computed (just below the `useHocuspocusCollaboration(...)` call), add:

```ts
useEffect(() => {
  onLiveCollaborationChange?.(wsEnabled && isSynced);
}, [wsEnabled, isSynced, onLiveCollaborationChange]);
```

(`useEffect` is already imported in this file.)

- [ ] **Step 3: Gate the content REST write in `NoteEditor`**

In `apps/notes/src/pages/NoteEditorPage.tsx`, inside the `NoteEditor` component:

Add the live-collab ref + handler near the other refs (after `const editorRef = useRef<Editor | null>(null);`):

```ts
const isLiveCollabRef = useRef(false);
const handleLiveCollaborationChange = useCallback((isLive: boolean) => {
  isLiveCollabRef.current = isLive;
}, []);
```

In `handleContentChange`, gate only the content save (leave `contentRef`, `setContent`, and `deriveAutoTitle` intact):

```ts
const handleContentChange = useCallback(
  (newContent: string) => {
    if (!canEdit) {
      return;
    }
    if (newContent === contentRef.current) {
      return;
    }
    contentRef.current = newContent;
    setContent(newContent);
    if (!isLiveCollabRef.current) {
      // Live CRDT already holds these edits and persists them via Hocuspocus
      // onStoreDocument; a REST content write would echo back and reset the caret.
      debouncedUpdateNote({ content: newContent });
    }
    deriveAutoTitle(newContent);
  },
  [canEdit, debouncedUpdateNote, deriveAutoTitle]
);
```

Pass the callback to `<CollaborativeEditor>`:

```tsx
<CollaborativeEditor
  noteId={noteId}
  initialContent={content}
  onUpdate={handleContentChange}
  editable={canEdit}
  autoFocus={canEdit && isNewNote}
  localFirst={isNewNote}
  onEditorReady={handleEditorReady}
  onVoiceNote={showVoiceNote ? handleVoiceNoteClick : undefined}
  onLiveCollaborationChange={handleLiveCollaborationChange}
/>
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && nx lint notes`
Expected: PASS, 0 new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/notes/src/components/editor/CollaborativeEditor.types.ts apps/notes/src/components/editor/CollaborativeEditor.tsx apps/notes/src/pages/NoteEditorPage.tsx
git commit -m "fix(editor): stop REST content autosave while live-collaborating to end caret jump"
```

---

## Task 4: Verification — reproduce + E2E

**No code.** Confirms the bug before the fix and its absence after.

- [ ] **Step 1: Capture the echo (Playwright MCP, run BEFORE Task 1–3 land or on a clean checkout)**

Start the app: `pnpm docker:up && pnpm dev:all`. Open `localhost:4200/notes/5281a621-5bac-43f5-bb93-f711fc55cf5e`. Via `browser_evaluate`, install a `MutationObserver` on `.ProseMirror` recording full child-list replacements, and a `fetch` wrapper logging `PATCH /notes/:id` timing into `window.__dbg`. Type in line 1, wait ~1s. Expected (bug present): a full `.ProseMirror` subtree replacement fires right after the PATCH response and `getSelection()` lands at doc end.

- [ ] **Step 2: Re-run after the fix**

Repeat Step 1 with the fix applied. Expected: no full-subtree replacement after typing; caret stays where you typed on lines 1, 2 and 3; `PATCH /notes/:id` with `{ content }` is NOT sent while synced (only `{ title }` when the auto-title changes).

- [ ] **Step 3: Manual E2E checklist**

- Reload the note → content + title intact (hydrated from CRDT).
- Open the same note as a second user → edits appear live; neither caret jumps.
- Dashboard list preview reflects new content within a few seconds (`onStoreDocument` debounce).
- MCP `get-note` returns up-to-date content after a short delay.
- Set `VITE_COLLABORATION_MODE` to a non-WS value (or create a new local-first note) → REST content autosave still persists.
- MCP `update-note` on a note you have open still surfaces the change (one expected rebuild there — pre-existing external-edit behavior, out of scope).

- [ ] **Step 4: CI gate before PR**

Run: `nx affected -t lint test build --base=main --head=HEAD` and `pnpm typecheck`
Expected: all green.

---

## Self-Review

**Spec coverage:** root cause (REST→CRDT echo) is removed by Task 3 (no content event emitted while live); content-column freshness preserved by Tasks 1–2 (derive HTML in `onStoreDocument`); non-collaborative path preserved by the `!isLiveCollabRef.current` gate; external-edit path (`applyExternalUpdate`) intentionally untouched. All covered.

**Placeholder scan:** every code step contains complete code and exact commands; no TBD/"handle edge cases". Task 3 explicitly justifies the absence of a unit test and routes verification to Task 4. OK.

**Type consistency:** `yDocToHtml(doc: Y.Doc): string` defined in Task 1, imported and called in Task 2. `updateContentWithYjsState(id, { content }, buffer)` matches `UpdateNoteContentData = UpdateNoteData & { content: string }`. `onLiveCollaborationChange?: (isLive: boolean) => void` is declared (types), fired (CollaborativeEditor), and consumed (NoteEditor) with matching signatures. `isLiveCollabRef` / `handleLiveCollaborationChange` names consistent across Task 3. OK.
