# Collaboration invariants — full detail

Canonical sources: `.claude/rules/collaboration.md`, `docs/PERMISSIONS.md`, `docs/ARCHITECTURE.md` in the knowtis repo.

## Architecture

1. Tiptap edits produce Y.Doc updates.
2. `@hocuspocus/provider` syncs Y.Doc + Awareness to the server.
3. Hocuspocus fans updates out to peers and persists on a debounce.
4. Persistence and auth are Hocuspocus extensions implemented as NestJS services, composed at module init.

Hocuspocus binds to the same Node HTTP server as the REST API; only the upgrade path differs (`/collaboration`). `stopOnSignals: false` — NestJS owns process lifecycle.

## Auth extension (`hocuspocus-auth.extension.ts`)

Handshake flow in `onAuthenticate` (throwing aborts; the message becomes the client's `reason`):

1. Verify JWT (real or anonymous) via `JwtService.verify`.
2. Load user (`UsersService.findById`) and note (`NoteRepository.findById`).
3. Build `SharedNote[]` from DB permissions + a valid `?shareToken=` URL param (`ANYONE_WITH_LINK` notes only).
4. `defineAbilityFor` (CASL — the SAME single ability used by HTTP) gates `read`/`update`.
5. `cannot('read')` → reject. `cannot('update')` → `connectionConfig.readOnly = true` (provider receives `scope: 'readonly'`; server rejects writes at protocol level).

Token transport: provider `token` config takes a function so a fresh JWT is read on each (re)connect; anonymous users use the same path via `POST /auth/anonymous`. Token-expiry disconnect uses code `4401`.

## Persistence extension (`hocuspocus-persistence.extension.ts`)

- `onLoadDocument`: hydrate Y.Doc from `note.yjsState` (Buffer); return `null` on missing/malformed state (fresh doc).
- `onStoreDocument`: encode live Y.Doc → `NoteRepository.updateYjsState(id, Buffer)`.
- **Trivial-fragment guard**: never overwrite non-trivial DB content with a trivial live doc (prevents empty-state clobbering when a fresh client connects before hydration).
- `updateYjsState` returns `Result` — log failures, never throw (throw = Hocuspocus closes the connection).
- Cadence `debounce: 2000` / `maxDebounce: 10000` / `unloadImmediately: false`; empty rooms unload automatically with a final store.

## External update broadcast

REST/MCP `update-note` mutations emit `NoteUpdatedEvent` (with `updates.content` + `yjsState`). `NoteUpdatedListener` → `HocuspocusService.applyExternalUpdate(noteId, state)`:

1. Validate incoming state in a probe Y.Doc (`isValidYjsUpdate`).
2. Short-circuit when no live document is loaded (next reader hydrates from DB).
3. `DirectConnection` + `transact()` — clear the non-trivial XML fragment, apply new state; fan-out delivers deltas. Always `disconnect()` in `finally`.

**Gotcha:** `DirectConnection.transact` wraps callbacks in `document.transact({ source: 'local' })`, overriding caller-supplied origin tags — origin-based filtering in the persistence extension is NOT reliable through this path. The resulting redundant persistence write is a no-op overwrite (accepted trade-off).

## Frontend

- `useHocuspocusCollaboration` wraps `HocuspocusProvider`; must consume the Y.Doc + Awareness from `@knowtis/crdt`'s `useYjs(noteId)` (single source of truth). Returns `{ status, isConnected, isSynced, readOnly }`; consumers call `editor.setEditable(false)` on readOnly.
- Presence: `useActiveCollaborators(noteId)` reads awareness states; `usePresenceBroadcast(noteId)` maintains the local entry. No manual encode/decode.
- Cleanup: `provider.destroy()` in effect cleanup; server-side `OnModuleDestroy` detaches the upgrade handler, flushes pending stores, then destroys.
