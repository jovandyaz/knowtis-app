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

- `onLoadDocument`: repository errors fail closed with `HANDSHAKE_FAILURE.INTERNAL_ERROR`; returning a blank document would let the next keystroke overwrite persisted content. A missing note returns `null`.
- When `yjsState` is absent but legacy HTML is non-trivial, convert it with `htmlToYjsState` and hydrate server-side. Client seeding in WebSocket mode races provider sync and duplicates initial content; local-first or collaboration-disabled mode may intentionally seed. Trivial HTML returns a fresh document.
- **Known malformed-hydration bugs**: failed conversion of non-trivial legacy HTML and malformed stored Yjs bytes are currently logged and return `null`, allowing a fresh document. Non-trivial persisted content with undecodable state must fail closed instead so a later edit cannot overwrite it.
- `onStoreDocument`: encode the Y.Doc, derive HTML with `yDocToHtml`, and persist both atomically through `updateContentWithYjsState`. If HTML derivation fails, preserve the edit by falling back to `updateYjsState`. Log `Result` errors; do not throw from the storage hook.
- **Trivial-fragment guard**: never overwrite non-trivial DB content with a trivial live doc (prevents empty-state clobbering when a fresh client connects before hydration).
- **Known guard bug**: the current lookup error path logs “failing open” and continues to persistence. Changes in this area must make that lookup failure skip storage; a transient read error must not authorize a trivial overwrite.
- Both persistence methods return `Result` — log failures, never throw (throw = Hocuspocus closes the connection).
- Cadence `debounce: 2000` / `maxDebounce: 10000` / `unloadImmediately: false`; empty rooms unload automatically with a final store.

## External update broadcast

REST/MCP `update-note` mutations emit `NoteUpdatedEvent` (with `updates.content` + `yjsState`). `NoteUpdatedListener` → `HocuspocusService.applyExternalUpdate(noteId, state)`:

1. Reject empty or zero-length Yjs state before validation; `Y.applyUpdate` treats it as a no-op and clearing first would wipe the live document.
2. Validate incoming state in a probe Y.Doc (`isValidYjsUpdate`).
3. Short-circuit when no live document is loaded (next reader hydrates from DB).
4. `DirectConnection` + `transact()` — clear the non-trivial XML fragment, apply new state; fan-out delivers deltas. Always `disconnect()` in `finally`.

**Gotcha:** `DirectConnection.transact` wraps callbacks in `document.transact({ source: 'local' })`, overriding caller-supplied origin tags — origin-based filtering in the persistence extension is NOT reliable through this path. The resulting redundant persistence write is a no-op overwrite (accepted trade-off).

## Frontend

- `useCollaborativeEditor` calls parameterless `useYjs()`, then `getYDoc(noteId)` and `getAwareness(noteId)`. `useHocuspocusCollaboration` must consume those same instances (single source of truth). It returns `{ status, isConnected, isSynced, readOnly }`; current shared-note UI exits editing through `onEditDenied` when the server reports read-only scope.
- Presence: `useActiveCollaborators(noteId)` reads awareness states; `usePresenceBroadcast(noteId)` maintains the local entry. No manual encode/decode.
- Cleanup: `provider.destroy()` in effect cleanup; server-side `OnModuleDestroy` detaches the upgrade handler, flushes pending stores, then destroys.
