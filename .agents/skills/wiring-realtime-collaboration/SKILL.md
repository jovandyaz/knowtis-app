---
name: wiring-realtime-collaboration
license: MIT
description: Guards Knowtis note-content and realtime-collaboration invariants across Tiptap, Yjs, and Hocuspocus, including REST/MCP content-to-CRDT bridging. Use when editing collaboration code; debugging duplicated, missing, stale, or overwritten note content; guest/share-link collaboration; read-only enforcement; WebSocket auth, reconnect, sync, persistence, external updates, presence, or awareness; or when asked about Y.Doc, CRDT, Hocuspocus, collaboration, or realtime notes. Not for general REST authorization or unrelated Socket.IO copilot streaming.
---

# Wiring realtime collaboration

Collaboration = Tiptap → Y.Doc updates → `@hocuspocus/provider` → Hocuspocus server (same Node HTTP server as the REST API, upgrade path `/collaboration`) → fan-out + debounced persistence. Full detail: [references/collab-invariants.md](references/collab-invariants.md).

## Diagnose by writer and boundary

Before changing code for duplicated, stale, missing, or overwritten content, enumerate every writer involved: editor initialization, Yjs provider sync, Hocuspocus hydration/persistence, REST mutations, MCP mutations, and external-update broadcast. A fix at one writer can duplicate the correction already made by another.

For guest or share-link failures, trace the share token from route to provider URL to the server handshake, then verify the CASL `read` and `update` decisions separately. Client-disabled controls are UX only; Hocuspocus must enforce read-only at the protocol boundary.

When a failure appears only in local development, reproduce against a production frontend build before changing CRDT logic. React StrictMode can replay mount effects and expose duplicate client initialization that does not occur in production, but it must not be used to dismiss a server-side persistence or authorization bug.

## Invariants (violations here cause data loss or auth bypass)

1. **Authorization happens at the handshake, server-side.** `HocuspocusAuthExtension.onAuthenticate` verifies the JWT, loads user + note, builds the CASL ability, and rejects on `cannot('read')` / sets `connectionConfig.readOnly = true` on `cannot('update')`. Read-only is enforced at the protocol level — never rely on client-side flags to block writes.
2. **The trivial-fragment guard must survive refactors.** `onStoreDocument` refuses to overwrite non-trivial DB content with a trivial live Y.Doc — this is what stops a freshly-connected client from clobbering REST/MCP-side updates with empty initial state.
3. **`DirectConnection.transact` overrides origin tags.** Hocuspocus wraps callbacks in `document.transact({ source: 'local' })`, so origin-based filtering inside the persistence extension is unreliable through that path. Don't build logic that depends on origins surviving it.
4. **MCP-issued JWTs are rejected at the collaboration handshake.** An MCP API key must never grant a live editing socket.
5. **Hydration uncertainty fails closed.** Returning a blank document after `findById` fails or non-trivial stored HTML/Yjs bytes cannot be decoded lets the next edit overwrite persisted content. Repository errors already normalize to `HANDSHAKE_FAILURE.INTERNAL_ERROR`; malformed non-trivial hydration currently returns a fresh document and is a known bug that must be changed to fail closed.
6. **The trivial-document guard must fail closed.** The current guard logs “failing open” when its repository lookup fails, then continues to persistence. Treat that as a known bug: skip storage on lookup failure so a transient read error cannot authorize a destructive trivial write.
7. **Persist HTML and Yjs state together.** Normal storage derives HTML and calls `updateContentWithYjsState`; if HTML conversion fails, fall back to `updateYjsState`. Both return `Result`; log errors rather than throwing from the storage hook.
8. **One Y.Doc + Awareness instance.** Call parameterless `useYjs()`, then `getYDoc(noteId)` and `getAwareness(noteId)`; pass those exact instances to Hocuspocus. Duplicate instances desync the editor.

## Operational facts

- Environment validation defaults `REDIS_URL` to `redis://localhost:6379`, so normal startup attempts Redis even when the variable is omitted. Production must set the real URL; single-instance mode exists only when `HocuspocusService` is constructed without one.
- Persistence cadence: `debounce: 2000`, `maxDebounce: 10000`. On shutdown, `flushPendingStores()` runs before `server.destroy()`.
- External updates (REST/MCP note mutations) reach live editors via `NoteUpdatedListener` → `HocuspocusService.applyExternalUpdate` → probe-validate → `DirectConnection.transact` merge; always `disconnect()` in `finally`.
- Share-token access: `?shareToken=` in the provider URL, honored only for `ANYONE_WITH_LINK` notes.
- A note with non-trivial legacy HTML and no `yjsState` is converted and hydrated server-side. Never seed client-side in WebSocket mode; it races provider sync and duplicates content. Local-first or collaboration-disabled mode may intentionally seed the document.
