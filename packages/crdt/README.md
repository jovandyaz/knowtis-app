# @knowtis/crdt

Yjs document layer for the Knowtis frontend: one `Y.Doc` per note with IndexedDB persistence, cross-tab sync over `BroadcastChannel`, and the awareness helpers the editor uses for live cursors. Source-only workspace library, imported via the `@knowtis/crdt` alias.

The network transport (Hocuspocus over WebSocket) is not in this package; `apps/notes/src/collaboration/useHocuspocusCollaboration.ts` attaches a `HocuspocusProvider` to the `Y.Doc` and `Awareness` created here. See [Architecture: Real-time Collaboration](../../docs/ARCHITECTURE.md#real-time-collaboration).

## Public API

Exported from [`src/index.ts`](src/index.ts):

| Export                                       | Purpose                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `YjsProvider`                                | React provider owning docs, persistence, awareness and the broadcast channel                                                             |
| `useYjs()`                                   | Returns the `YjsContextValue`; throws outside `YjsProvider`                                                                              |
| `COLLAB_CONFIG`                              | `CHANNEL_NAME`, `ROOM_PREFIX`, `PRESENCE_INTERVAL_MS` (5000), `STALE_USER_TIMEOUT_MS` (12000), `PROVIDER_INIT_DELAY_MS`, `CURSOR_COLORS` |
| `getRemoteUserStates(states, localClientId)` | Filters awareness states to remote users that have a `user` and `cursor`                                                                 |
| `createUserDecorations(userState, docSize)`  | ProseMirror caret + selection decorations for one remote user                                                                            |
| `docStateToBase64(doc)`                      | Full CRDT state as a base64 update, for persisting through JSON transports                                                               |
| Types                                        | `DocumentResources`, `YjsProviderProps`, `AwarenessState`, `CollaborativeCursorsOptions`, `CollaborativeUser`, `YjsContextValue`         |

### `YjsContextValue`

`getYDoc(noteId)`, `getYText(noteId)` (the `Y.XmlFragment` under `YJS_XML_FRAGMENT_NAME` from `@knowtis/editor-schema`), `getAwareness(noteId)`, `currentUser`, `activeUsers`, `broadcastPresence(noteId)`, `broadcastLeave(noteId)`, `clearAwarenessForNote(noteId)`.

## Mechanics

### Documents and offline persistence

`getYDoc(noteId)` lazily creates a `Y.Doc` and immediately wraps it in `new IndexeddbPersistence(\`note-${noteId}\`, doc)` (`src/YjsProvider.tsx`). Every note is therefore stored locally and loads from IndexedDB before any server sync, whatever `VITE_COLLABORATION_MODE` is set to. Docs, persistence and awareness instances are kept in maps and destroyed when the provider unmounts.

### Cross-tab sync

The provider opens `new BroadcastChannel(COLLAB_CONFIG.CHANNEL_NAME)`. Each doc `update` is posted as an `update` message and applied with `Y.applyUpdate` in other tabs, so edits converge between tabs of the same browser without a server. `presence` and `leave` messages feed `activeUsers`; a timer running every `PRESENCE_INTERVAL_MS` drops users whose `lastSeen` is older than `STALE_USER_TIMEOUT_MS`.

### Identity

`currentUser` is created once per tab (`src/YjsProvider.helpers.ts`): a random instance id, a deterministic adjective-animal name derived from that id, and a color from `COLLAB_CONFIG.CURSOR_COLORS`.

### Awareness fields

`getAwareness(noteId)` creates a `y-protocols` `Awareness` on the doc and sets the local `user` field to `{ name, color }`. The `cursor` field (`{ anchor, head }`) is owned by the `CollaborativeCursors` extension in `@knowtis/editor`; `clearAwarenessForNote` resets it to `null`. `AwarenessState` types both fields.

## Testing

```bash
nx test crdt    # @nx/vitest:test
```
