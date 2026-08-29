---
name: wiring-realtime-collaboration
description: Guards the Knowtis realtime-collaboration invariants when touching Yjs/Hocuspocus code — handshake authentication, server-enforced read-only, CRDT persistence guards, and external-update broadcast. Use when editing anything under the collaboration module or frontend collaboration hooks, debugging WebSocket permission or sync behavior, changing Yjs persistence, or when asked about "colaboración", "tiempo real", CRDT, Hocuspocus, or presence/awareness. Not for REST-level permissions (see docs/PERMISSIONS.md) or copilot streaming (use building-copilot-features).
---

# Wiring realtime collaboration

Collaboration = Tiptap → Y.Doc updates → `@hocuspocus/provider` → Hocuspocus server (same Node HTTP server as the REST API, upgrade path `/collaboration`) → fan-out + debounced persistence. Full detail: [references/collab-invariants.md](references/collab-invariants.md).

## Invariants (violations here cause data loss or auth bypass)

1. **Authorization happens at the handshake, server-side.** `HocuspocusAuthExtension.onAuthenticate` verifies the JWT, loads user + note, builds the CASL ability, and rejects on `cannot('read')` / sets `connectionConfig.readOnly = true` on `cannot('update')`. Read-only is enforced at the protocol level — never rely on client-side flags to block writes.
2. **The trivial-fragment guard must survive refactors.** `onStoreDocument` refuses to overwrite non-trivial DB content with a trivial live Y.Doc — this is what stops a freshly-connected client from clobbering REST/MCP-side updates with empty initial state.
3. **`DirectConnection.transact` overrides origin tags.** Hocuspocus wraps callbacks in `document.transact({ source: 'local' })`, so origin-based filtering inside the persistence extension is unreliable through that path. Don't build logic that depends on origins surviving it.
4. **MCP-issued JWTs are rejected at the collaboration handshake.** An MCP API key must never grant a live editing socket.
5. **Persistence failures must not throw.** `NoteRepository.updateYjsState` returns a `Result`; log failures — a throw makes Hocuspocus close the connection.
6. **One Y.Doc + Awareness instance.** The frontend provider must reuse the doc/awareness from `@knowtis/crdt`'s `useYjs(noteId)` — duplicate instances desync the editor.

## Operational facts

- Multi-instance fan-out requires `REDIS_URL` (`@hocuspocus/extension-redis`); without it the server is single-instance (dev only).
- Persistence cadence: `debounce: 2000`, `maxDebounce: 10000`. On shutdown, `flushPendingStores()` runs before `server.destroy()`.
- External updates (REST/MCP note mutations) reach live editors via `NoteUpdatedListener` → `HocuspocusService.applyExternalUpdate` → probe-validate → `DirectConnection.transact` merge; always `disconnect()` in `finally`.
- Share-token access: `?shareToken=` in the provider URL, honored only for `ANYONE_WITH_LINK` notes.
