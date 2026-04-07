---
paths:
  - 'apps/api/src/modules/collaboration/**'
  - 'apps/notes/src/**/collaboration/**'
  - 'apps/notes/src/hooks/useWebSocket*'
  - 'libs/api-client/src/lib/collaboration*'
---

# Real-time Collaboration Rules

## Architecture

The collaboration system uses Yjs (CRDT) for conflict-free document sync over Socket.io:

1. User edits in Tiptap editor produce Y.Doc updates
2. Y.Doc generates binary diff (Uint8Array)
3. Diff sent via Socket.io to `CollaborationGateway` (`/collaboration` namespace)
4. Server applies update to room's Y.Doc and broadcasts to other room members
5. Clients apply incoming update, Tiptap re-renders

## Backend Gateway (`CollaborationGateway`)

- Decorated with `@WebSocketGateway({ namespace: '/collaboration' })`.
- Implements `OnGatewayInit`, `OnGatewayConnection`, `OnGatewayDisconnect` lifecycle interfaces.
- Event handlers use `@SubscribeMessage(COLLABORATION_EVENTS.EVENT_NAME)` with typed payloads.
- Socket data is typed via `AuthenticatedSocket` interface extending Socket with `data: { wsUser, shareToken, noteId, user, readOnly }`.
- Room-based broadcasting: `client.to(noteId).emit(event, payload)` — never broadcast to the sender.

## WebSocket Authentication

- JWT token sent via Socket.IO `auth.token` field (NOT `extraHeaders`).
- Share token support for anonymous viewers: `auth.shareToken`.
- `WsAuthService` validates tokens and attaches user data to `socket.data`.

## Yjs Document Lifecycle

- Each collaboration room has one Y.Doc instance on the server.
- Y.Doc must be destroyed when the last user leaves the room — memory leak if not cleaned up.
- Binary Yjs updates (`Uint8Array`) must be validated before applying to prevent corrupt document state.
- Persist Y.Doc state (`yjs_state` column in notes table) periodically and on room close.

## Awareness (Presence)

- `useAwarenessSync` hook encodes local awareness updates and sends via `collaborationClient.sendAwarenessUpdate()`.
- Incoming awareness changes applied with `applyAwarenessUpdate()` from `y-protocols/awareness`.
- `useActiveCollaborators` reads awareness state for remote cursors and user count.
- Awareness updates must be debounced to prevent flooding the WebSocket connection.

## Resource Cleanup

- On client disconnect: remove socket from room, clean up event listeners, update awareness.
- On server: dispose Y.Doc when room is empty, persist final state to database.
- Socket.io `disconnect` event is the authoritative signal — handle all cleanup there.

## Permission Enforcement

- Read-only users: `socket.data.readOnly = true`. Emit `EDIT_DENIED` event if they attempt to sync updates.
- Permission checks happen on join and on every write operation.
