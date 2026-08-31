---
paths:
  - 'apps/api/src/modules/collaboration/**'
  - 'apps/notes/src/**/collaboration/**'
  - 'apps/notes/src/hooks/useCollaborativeEditor*'
  - 'apps/notes/src/hooks/useActiveCollaborators*'
  - 'apps/notes/src/hooks/usePresenceBroadcast*'
  - 'apps/notes/src/components/editor/CollaborativeEditor*'
  - 'apps/notes/src/pages/SharedNotePage*'
  - 'libs/api-client/src/lib/collaboration*'
---

# Real-time Collaboration Rules

## Architecture

Real-time collaboration uses **Yjs (CRDT)** for conflict-free document sync over **Hocuspocus**, the official Yjs WebSocket server:

1. User edits in Tiptap editor produce Y.Doc updates.
2. `@hocuspocus/provider` syncs the local `Y.Doc` + `Awareness` to the server.
3. Server's `Hocuspocus` instance fans the update out to other connected peers and persists periodically.
4. Persistence and authentication are pluggable via Hocuspocus' extension API; both extensions are NestJS services that compose at module init.

Hocuspocus binds to the same Node HTTP server as the REST API — only the upgrade path differs (`/collaboration`).

## Backend Service (`HocuspocusService`)

- `apps/api/src/modules/collaboration/hocuspocus.service.ts` — `@Injectable()` NestJS service implementing `OnModuleInit` + `OnModuleDestroy`.
- Instantiates `Server` from `@hocuspocus/server` with `stopOnSignals: false` (NestJS owns process lifecycle).
- Forwards `'upgrade'` events from the NestJS HTTP server when the URL starts with `/collaboration` to Hocuspocus' internal HTTP server (which has the crossws WebSocket adapter wired).
- Persistence cadence: `debounce: 2000`, `maxDebounce: 10000`, `unloadImmediately: false` (matches the prior gateway).
- Multi-instance fan-out: when `REDIS_URL` is set, registers `@hocuspocus/extension-redis` so multiple API replicas stay in sync. Environment validation defaults an omitted URL to `redis://localhost:6379`; production must set the real URL. Single-instance mode exists only when the service is constructed without one.

## Authentication (`HocuspocusAuthExtension`)

- `apps/api/src/modules/collaboration/extensions/hocuspocus-auth.extension.ts`.
- Implements Hocuspocus' `onAuthenticate` hook. Throws to abort the handshake; the thrown message becomes the `reason` the client receives.
- Handshake flow (one method per concern; orchestrated by `authenticate`):
  1. Verify the JWT (real or anonymous) via `JwtService.verify`.
  2. Load the authenticated user via `UsersService.findById`.
  3. Load the note via `NoteRepository.findById` (throws if missing).
  4. Build the `SharedNote[]` list combining DB-stored permissions and any valid `?shareToken=` URL parameter (`ANYONE_WITH_LINK` notes only).
  5. Define the CASL ability via `defineAbilityFor` and gate `read`/`update` on the note subject.
  6. Set `connectionConfig.readOnly = true` when the user can read but not edit.
- The extension publishes a `HocuspocusAuthContext` (`{ user, noteId }`) that downstream extensions can consume via the `Context` generic.
- Note/permission repository failures are logged server-side and normalized to `INTERNAL_ERROR`; do not leak database details through the WebSocket close reason. A missing/invalid user remains `INVALID_TOKEN`.

### Token transport

- Frontend supplies the JWT via the `token` config of `@hocuspocus/provider` — pass a function so the latest token is read on each (re)connect.
- Anonymous users authenticate via the same path (anonymous JWT issued by `POST /auth/anonymous`).
- Share-tokened public/link-share notes: append `?shareToken=xxx` to the provider's `url` config. The auth extension reads it from `requestParameters` and grants the configured `generalAccessPermission`.

## Persistence (`HocuspocusPersistenceExtension`)

- `apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.ts`.
- `onLoadDocument`: repository errors fail closed with `INTERNAL_ERROR`. A missing note returns `null`. Non-trivial legacy HTML without `yjsState` is converted and hydrated server-side; client seeding in WebSocket mode races provider sync and duplicates content.
- Known malformed-hydration bug: failed conversion of non-trivial legacy HTML and malformed stored Yjs bytes currently return `null`, allowing a fresh document. These paths must fail closed before a later edit can overwrite persisted content.
- `onStoreDocument`: derives HTML from the live `Y.Doc` and persists HTML + Yjs state atomically via `updateContentWithYjsState`. If HTML derivation fails, it preserves the edit by falling back to `updateYjsState`.
- **Trivial-fragment guard**: refuses to overwrite non-trivial DB content with a trivial live `Y.Doc`. Prevents the CRDT layer from clobbering REST/MCP-side updates with empty initial state when a fresh client connects before hydration completes.
- Known guard bug: a repository lookup error currently logs “failing open” and continues. The guard must skip storage on lookup failure so a transient read error cannot authorize a trivial overwrite.
- Both persistence methods return `Result`; failures are logged but do not throw from the storage hook.

## External Update Broadcast (`NoteUpdatedListener` + `HocuspocusService.applyExternalUpdate`)

- REST/MCP `update-note` mutations emit `NoteUpdatedEvent`. `NoteUpdatedListener` listens for events with both `updates.content` and `yjsState`.
- It calls `HocuspocusService.applyExternalUpdate(noteId, state)` which:
  1. Validates the incoming state in a probe `Y.Doc` (`isValidYjsUpdate`).
  2. Short-circuits if no live document is loaded for the note (no editors connected — next reader hydrates from DB).
  3. Opens a `DirectConnection` and runs `transact()` (`mergeIntoLiveDocument`): clears the non-trivial XML fragment then applies the new state. Hocuspocus' fan-out delivers the resulting delta to connected peers automatically.
- Always `disconnect()` the `DirectConnection` in `finally`.
- `DirectConnection.transact` wraps callbacks in `document.transact({ source: 'local' })`, which overrides any caller-supplied origin tag — so origin-based filtering inside the persistence extension is NOT reliable through this code path. The redundant write produced by the post-broadcast persistence cycle is a no-op overwrite (REST handler already persisted the same state). Acceptable trade-off; revisit if persistence cost ever matters.

## Frontend Provider (`useHocuspocusCollaboration`)

- `apps/notes/src/collaboration/useHocuspocusCollaboration.ts` — React hook wrapping `HocuspocusProvider`.
- `useCollaborativeEditor` calls parameterless `useYjs()`, then `getYDoc(noteId)` and `getAwareness(noteId)`. Hocuspocus receives those same instances so editor and provider share one source of truth.
- Handles `onStatus`, `onAuthenticated` (sets `readOnly`), `onAuthenticationFailed`, and `onSynced` callbacks.
- Returns `{ status, isConnected, isSynced, readOnly }`; the shared-note UI currently exits editing through `onEditDenied` when the server reports read-only scope.
- Reconnection backoff is built into the provider; credential failures get one judged refresh attempt, terminal denials stop immediately, and `INTERNAL_ERROR` does not spend the refresh attempt.

## Awareness (Presence)

- The provider operates on the same `Awareness` instance produced by `@knowtis/crdt`'s `YjsProvider`. Local presence updates (`Awareness.setLocalState`) are broadcast automatically; remote ones land via the same instance.
- `useActiveCollaborators(noteId)` reads the awareness states map for remote cursors and user count.
- `usePresenceBroadcast(noteId)` keeps the local user's awareness entry up to date (display name, color, etc.).
- No manual encode/decode of awareness updates — Hocuspocus' protocol handles it.

## Resource Cleanup

- On client unmount: `useHocuspocusCollaboration` calls `provider.destroy()` in the effect cleanup. The provider closes the WebSocket and tears down its event listeners.
- On server module destroy (`OnModuleDestroy`): detach the upgrade handler, call `flushPendingStores()` (forces debounced `onStoreDocument` to run before shutdown), then `await server.destroy()`.
- Empty rooms: Hocuspocus unloads the `Y.Doc` automatically (respects `unloadImmediately: false` debounce). Persistence extension's final `onStoreDocument` runs as part of unload.

## Permission Enforcement

- Read-only flag is set server-side during `onAuthenticate` (`connectionConfig.readOnly = true`) when CASL denies `update`. The provider receives `scope: 'readonly'` via `onAuthenticated`.
- Frontend should not rely on client-side flags to block writes — the server rejects updates from read-only connections at the protocol level.
