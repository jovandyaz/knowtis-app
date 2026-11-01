---
paths:
  - 'apps/api/src/modules/collaboration/**'
  - 'apps/notes/src/**/collaboration/**'
  - 'apps/notes/src/hooks/useCollaborativeEditor*'
  - 'apps/notes/src/hooks/useActiveCollaborators*'
  - 'apps/notes/src/components/editor/CollaborativeEditor*'
  - 'apps/notes/src/pages/SharedNotePage*'
---

# Real-time collaboration

Before touching duplicated, stale, lost or overwritten content, enumerate every writer: editor init, provider sync, hydration and persistence, REST, MCP, external broadcast. A fix at one writer can duplicate a correction another already made.

## Server

- Access is decided on the server: the handshake sets `connectionConfig.readOnly`, and `guardHooks` re-checks the access lease before every message and sync (a stale session closes with code 4403). Client flags are UX only.
- MCP JWTs are rejected at the handshake (`loadAuthenticatedUser`), so an API key never gets an editing socket.
- Uncertain hydration must fail closed: a blank document lets the next keystroke overwrite the note. Two known bugs break this, so do not copy them: `onLoadDocument` returns `null` on failed legacy-HTML conversion and on malformed stored Yjs bytes, and the trivial-fragment guard in `onStoreDocument` keeps going when its lookup fails.
- `applyExternalUpdate` must reject an empty `yjsState` before validating: `Y.applyUpdate` treats it as a no-op, and the fragment clear that precedes it would wipe the live document. `NoteUpdatedListener` guards the same case.
- `DirectConnection.transact` forces `{ source: 'local' }`, so origin-based filtering in the persistence extension is unreliable on that path. The redundant store after a broadcast is accepted.

## Client

- In WebSocket mode the server hydrates: a client seed races provider sync and forks a duplicate CRDT copy. Only local-first or collaboration-disabled mode may seed (`initialContent` in `CollaborativeEditor`).
- An expired token closes with code 4401 (`armExpiryDisconnect`, handled in the `onClose` of `useHocuspocusCollaboration`).
- `createTokenRefreshPolicy` coalesces concurrent attempts, and `unavailable` does not spend the single attempt. Exhausting it closes the connection and fires `onSessionExpired`. `INTERNAL_ERROR` never reaches it; `FORBIDDEN` and `NOTE_NOT_FOUND` stop immediately.
- One `Y.Doc` per note outlives connections, but each connection owns a new `Awareness`: `provider.destroy()` destroys the one it holds.
- `applyAwarenessUpdate` accepts only higher clocks, the server keeps `meta[clientID].clock`, and every connection reuses the doc's clientID, so a new awareness at clock 0 is silently ignored. `createConnectionAwareness` seeds `meta` from the per-`Y.Doc` clock in the `lastPresenceClocks` WeakMap.
- Presence tests replay all sockets into ONE shared server awareness (`presenceOnServer`); one per socket hides clock and destroyed-awareness bugs.
