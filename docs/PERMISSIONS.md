# Permissions & Sharing

This document describes how note permissions, access control, and sharing work in Knowtis using the **General Access** model (similar to Google Docs).

---

## Table of Contents

1. [Access Levels](#access-levels)
2. [Sharing Mechanisms](#sharing-mechanisms)
3. [Access Validation](#access-validation)
4. [WebSocket Collaboration Permissions](#websocket-collaboration-permissions)
5. [API Endpoints](#api-endpoints)
6. [Frontend Behavior](#frontend-behavior)
7. [Access Matrix](#access-matrix)
8. [Database Schema](#database-schema)
9. [Key Files Reference](#key-files-reference)

---

## Access Levels

Knowtis defines three access levels:

| Level      | Value    | Stored in DB                        | Description                     |
| ---------- | -------- | ----------------------------------- | ------------------------------- |
| **Owner**  | `owner`  | No (derived from `notes.ownerId`)   | Full control over the note      |
| **Editor** | `editor` | Yes (`note_permissions.permission`) | Can read and edit content/title |
| **Viewer** | `viewer` | Yes (`note_permissions.permission`) | Read-only access                |

The `owner` level is computed at runtime by comparing `note.ownerId` with the current user ID. Only `viewer` and `editor` are persisted as a PostgreSQL enum (`permission_level`).

These are defined in `libs/shared/types/src/lib/note.types.ts`:

```typescript
const PERMISSION = { VIEWER: 'viewer', EDITOR: 'editor' } as const;
const ACCESS = { OWNER: 'owner', ...PERMISSION } as const;
```

### Owner-Only Operations

Only the note owner can:

- Change General Access settings (restricted / anyone with the link)
- Set the general access permission level (viewer / editor)
- Toggle "Editors can share"
- Grant and revoke direct permissions to other users
- View the collaborators list
- Delete the note

### Editor Operations (when `editorsCanShare` is enabled)

Editors can:

- Change General Access settings
- Set the general access permission level
- Grant direct permissions to other users (if allowed by owner)

---

## Sharing Mechanisms

There are two ways to share a note: **General Access** (link-based) and **Direct Permissions** (user-to-user).

### 1. General Access (Link-based Sharing)

Similar to Google Docs, each note has a **General Access** setting:

- **Restricted**: Only people with explicit access can open the note
- **Anyone with the link**: Anyone with the share link can access the note

When "Anyone with the link" is enabled:

- A unique `shareToken` (128-bit, 32-char hex via `crypto.randomBytes(16)`) is automatically generated
- The `generalAccessPermission` determines what people with the link can do:
  - **Viewer**: Read-only access
  - **Editor**: Can read and edit
- The share link is: `${origin}/shared/${shareToken}`

Key features:

- **Single token per note**: Unlike the old model, there's only one share link per note
- **No expiration**: Links remain valid until the owner changes access back to "Restricted"
- **Automatic token management**: Token is generated when enabling link access, cleared when restricting
- **Public access**: Shared notes can be accessed without authentication via `/shared/:token`

### 2. Direct Permissions (user-to-user)

The owner (or editors if `editorsCanShare` is true) can grant specific users `viewer` or `editor` access. This creates a record in the `note_permissions` table.

- If a permission already exists for the user, it is updated (upsert behavior)
- Notes shared via direct permissions appear in the recipient's dashboard ("My Notes")
- Revoking deletes the permission record

### 3. Editors Can Share

The `editorsCanShare` boolean (owner-only setting) controls whether editors can manage sharing:

- When `true`: Editors can change General Access settings and invite other users
- When `false`: Only the owner can share the note

---

## Access Validation

Access is validated at multiple layers: HTTP handlers, the repository, and the WebSocket gateway.

### HTTP Layer

The controller uses `JwtAuthGuard` + `PoliciesGuard` on all endpoints except those marked `@Public()`. Each endpoint declares a required permission via `@RequirePermission(action, subject)`.

Individual handlers validate ownership and permissions:

```
Controller (@RequirePermission) → Handler (business logic check) → Repository (hasAccess)
```

### `hasAccess()` Method

Located in `DrizzleNoteRepository`, this is the central access check. It evaluates in order:

1. **Owner?** → `note.ownerId === userId` → full access
2. **General Access enabled?** → `note.generalAccess === 'anyone_with_link'` AND no specific permission required → read access (permission level from `generalAccessPermission`)
3. **Direct permission?** → Lookup in `note_permissions` table
   - If `requiredPermission='editor'` → only if `permission.isEditor()`
   - Otherwise → any permission grants access

If none of the above match, access is denied.

### `findAccessibleByUser()` (Dashboard Listing)

This method returns notes for the authenticated user's dashboard. It includes:

- Notes where `notes.ownerId = userId` (owned)
- Notes where `note_permissions.userId = userId` (shared directly)

Notes shared via "Anyone with the link" from other users are **excluded** from the dashboard listing.

---

## WebSocket Collaboration Permissions

The collaboration gateway (`CollaborationGateway`) validates access when a client joins a room via the `JOIN_ROOM` event.

### Connection Flow

1. **`handleConnection`**: Extracts auth from Socket.io handshake:
   - JWT token → `AuthenticatedWsUser`
   - Share token → stored in `client.data.shareToken`
   - Neither → `AnonymousWsUser`

2. **`handleJoinRoom`**: Calls `verifyNoteAccess()` which checks in order:
   1. Note doesn't exist → allow (transient room for new notes)
   2. Authenticated user has access (`hasAccess`) → allowed; `canEdit` determines `readOnly` flag
   3. Share token valid (`validateShareToken`) → allowed; permission determines `readOnly`
   4. Note has general access enabled (`isNotePublic`) → allowed, permission from `generalAccessPermission`
   5. None of the above → denied

3. **`readOnly` flag**: Set on `client.data.readOnly` at join time. Checked on every `SYNC_UPDATE` event. If `readOnly=true`, the update is rejected with `EDIT_DENIED`.

### Share Token Validation (`validateShareToken`)

Validates that:

- Note exists for the given `noteId`
- Note's `shareToken` matches the provided token
- Note's `generalAccess` is set to `'anyone_with_link'`

Returns the `generalAccessPermission` (`viewer`/`editor`) or `null` if invalid.

---

## API Endpoints

All endpoints are under `POST|GET|PATCH|DELETE /notes/...` and require `JwtAuthGuard` + `PoliciesGuard` unless marked `@Public()`.

### Note CRUD

| Method   | Path         | Auth | Description                                                                       |
| -------- | ------------ | ---- | --------------------------------------------------------------------------------- |
| `GET`    | `/notes`     | JWT  | List accessible notes (owned + shared)                                            |
| `GET`    | `/notes/:id` | JWT  | Get single note with access level                                                 |
| `POST`   | `/notes`     | JWT  | Create note                                                                       |
| `PATCH`  | `/notes/:id` | JWT  | Update note (owner: all fields; editor: title+content+sharing if editorsCanShare) |
| `DELETE` | `/notes/:id` | JWT  | Delete note (owner only)                                                          |

#### Update Note Fields

The `PATCH /notes/:id` endpoint accepts:

- `title` (owner/editor)
- `content` (owner/editor)
- `generalAccess` (owner, or editor if `editorsCanShare=true`)
- `generalAccessPermission` (owner, or editor if `editorsCanShare=true`)
- `editorsCanShare` (owner only)

When `generalAccess` is changed to `'anyone_with_link'` and no `shareToken` exists, one is automatically generated. When changed to `'restricted'`, the `shareToken` is cleared.

### Direct Permissions

| Method   | Path                       | Auth | Description                                       |
| -------- | -------------------------- | ---- | ------------------------------------------------- |
| `POST`   | `/notes/:id/share`         | JWT  | Grant/update permission (owner or sharing editor) |
| `DELETE` | `/notes/:id/share/:userId` | JWT  | Revoke user access (owner only)                   |
| `GET`    | `/notes/:id/collaborators` | JWT  | List collaborators (owner only)                   |

### Public Share Link Access

| Method | Path                   | Auth       | Description                           |
| ------ | ---------------------- | ---------- | ------------------------------------- |
| `GET`  | `/notes/shared/:token` | **Public** | Access note via share token (no auth) |

### Error Codes

| Code                    | HTTP Status | Description                                  |
| ----------------------- | ----------- | -------------------------------------------- |
| `NOTE_NOT_FOUND`        | 404         | Note does not exist                          |
| `PERMISSION_DENIED`     | 403         | User lacks required permission               |
| `SHARE_TOKEN_NOT_FOUND` | 404         | Token does not match or access is restricted |
| `INVALID_PERMISSION`    | 400         | Invalid permission level                     |
| `OWNER_ONLY`            | 403         | Operation requires note ownership            |

---

## Frontend Behavior

### Routes

| Route                           | Auth Required | Description                                |
| ------------------------------- | ------------- | ------------------------------------------ |
| `/_authenticated/notes.$noteId` | Yes           | Full note editor (owns or has permissions) |
| `/shared/$token`                | No            | Shared note view via token                 |

### Dashboard ("My Notes")

The `useNotes()` hook fetches `GET /notes`, which returns only:

- Notes the user owns
- Notes explicitly shared with the user (via `note_permissions`)

Each note includes an `accessLevel` field (`owner`, `editor`, or `viewer`).

### Note Editor Page

The editor page adapts based on `accessLevel` and `editorsCanShare`:

- **Owner/Editor**: Title and content are editable. Auto-save is active. Real-time collaboration enabled.
- **Viewer**: Title and content inputs are disabled. No save indicator.
- **Owner**: Share dialog is visible
- **Editor (when `editorsCanShare=true`)**: Share dialog is visible

An access badge displays the current permission level.

### Share Dialog

The ShareDialog component provides:

1. **General Access Toggle**:
   - "Restricted" (default)
   - "Anyone with the link"

2. **Permission Selector** (visible when "Anyone with the link"):
   - Viewer
   - Editor

3. **Copy Link Button** (visible when `shareToken` exists):
   - Copies `${origin}/shared/${shareToken}` to clipboard

4. **Editors Can Share Toggle** (owner only):
   - Allows editors to manage sharing

5. **Info Badge** (for non-owners):
   - Displays sharing capabilities based on `editorsCanShare`

### Shared Note Page (`/shared/:token`)

- Fetches note via `GET /notes/shared/:token` (no auth header)
- Displays an access badge ("Editor" or "View only") based on `generalAccessPermission`
- Renders note content (as read-only HTML for viewers, or interactive editor for editors with real-time sync)
- Shows "Sign in" button for unauthenticated users
- Handles errors:
  - 404 → "Link not found or disabled" message

---

## Access Matrix

| Action                | Owner | Editor (direct) | Viewer (direct) | Link (editor perm) | Link (viewer perm) | No access |
| --------------------- | ----- | --------------- | --------------- | ------------------ | ------------------ | --------- |
| Read note             | ✓     | ✓               | ✓               | ✓                  | ✓                  | ✗         |
| Edit content          | ✓     | ✓               | ✗               | ✓                  | ✗                  | ✗         |
| Edit title            | ✓     | ✓               | ✗               | ✓                  | ✗                  | ✗         |
| Change general access | ✓     | ✓\*             | ✗               | ✓\*                | ✗                  | ✗         |
| Toggle editors share  | ✓     | ✗               | ✗               | ✗                  | ✗                  | ✗         |
| Share with users      | ✓     | ✓\*             | ✗               | ✓\*                | ✗                  | ✗         |
| Delete note           | ✓     | ✗               | ✗               | ✗                  | ✗                  | ✗         |
| Real-time edit (WS)   | ✓     | ✓               | ✗               | ✓                  | ✗                  | ✗         |
| Appears in dashboard  | ✓     | ✓               | ✓               | ✗                  | ✗                  | ✗         |

\* Only when `editorsCanShare` is `true`

---

## Database Schema

### `notes`

| Column                      | Type                    | Description                                           |
| --------------------------- | ----------------------- | ----------------------------------------------------- |
| `id`                        | uuid (PK)               | Note identifier                                       |
| `title`                     | text                    | Note title                                            |
| `content`                   | text                    | Note content (HTML)                                   |
| `yjs_state`                 | bytea                   | Yjs CRDT document state                               |
| `owner_id`                  | uuid (FK → users)       | Note owner                                            |
| `general_access`            | general_access enum     | Access level: `restricted` or `anyone_with_link`      |
| `general_access_permission` | permission_level enum   | Permission for link access: `viewer` or `editor`      |
| `share_token`               | text (unique, nullable) | 32-char hex token for link sharing                    |
| `editors_can_share`         | boolean                 | Whether editors can manage sharing (default: `false`) |
| `created_at`                | timestamptz             | Creation timestamp                                    |
| `updated_at`                | timestamptz             | Last update timestamp                                 |

Indexes: `owner_id`, `updated_at`, `general_access`, `share_token`

PostgreSQL enums:

```sql
CREATE TYPE general_access AS ENUM ('restricted', 'anyone_with_link');
CREATE TYPE permission_level AS ENUM ('viewer', 'editor');
```

### `note_permissions`

| Column       | Type                  | Description                  |
| ------------ | --------------------- | ---------------------------- |
| `id`         | uuid (PK)             | Permission record identifier |
| `note_id`    | uuid (FK → notes)     | Target note                  |
| `user_id`    | uuid (FK → users)     | Granted user                 |
| `permission` | permission_level enum | `viewer` or `editor`         |
| `created_at` | timestamptz           | When permission was granted  |

Indexes: `note_id`, `user_id`, composite `(note_id, user_id)`

---

## Key Files Reference

### Domain Layer

| File                                                                     | Description                                 |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| `libs/shared/types/src/lib/note.types.ts`                                | Permission/access constants and types       |
| `apps/api/src/modules/notes/domain/value-objects/permission-level.vo.ts` | PermissionLevel value object                |
| `apps/api/src/modules/notes/domain/entities/note.entity.ts`              | NoteEntity, NotePermissionEntity interfaces |
| `apps/api/src/modules/notes/domain/errors/note.errors.ts`                | Error codes and factory functions           |

### Ports (Interfaces)

| File                                                               | Description                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/api/src/modules/notes/domain/ports/note-read.repository.ts`  | `findAccessibleByUser`, `findById`, `findByOwner`, `findByShareToken` |
| `apps/api/src/modules/notes/domain/ports/permission.repository.ts` | Permission CRUD + `hasAccess`                                         |

### Infrastructure

| File                                                                               | Description                             |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| `apps/api/src/modules/notes/infrastructure/persistence/drizzle-note.repository.ts` | Repository implementation (Drizzle ORM) |
| `apps/api/src/database/schema/notes.schema.ts`                                     | Database schema (notes, permissions)    |

### Application (Handlers)

| File                                                                          | Description                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/api/src/modules/notes/application/queries/get-notes.handler.ts`         | List accessible notes (dashboard)                          |
| `apps/api/src/modules/notes/application/queries/get-note.handler.ts`          | Get single note with access level                          |
| `apps/api/src/modules/notes/application/queries/get-note-by-token.handler.ts` | Public note access via share token                         |
| `apps/api/src/modules/notes/application/commands/update-note.handler.ts`      | Update with permission checks, auto-generates/clears token |
| `apps/api/src/modules/notes/application/commands/share-note.handler.ts`       | Grant direct permission (upsert), respects editorsCanShare |
| `apps/api/src/modules/notes/application/commands/revoke-access.handler.ts`    | Remove direct permission                                   |
| `apps/api/src/modules/notes/application/queries/get-collaborators.handler.ts` | List users with access                                     |

### WebSocket

| File                                                          | Description                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/api/src/modules/collaboration/collaboration.gateway.ts` | WS gateway with `verifyNoteAccess`                           |
| `apps/api/src/modules/collaboration/collaboration.service.ts` | `hasAccess`, `canEdit`, `validateShareToken`, `isNotePublic` |
| `apps/api/src/modules/collaboration/ws-auth.service.ts`       | JWT/share token extraction from handshake                    |

### Authorization

| File                                        | Description                                |
| ------------------------------------------- | ------------------------------------------ |
| `libs/authorization/src/lib/types.ts`       | NoteSubject, PermissionContext definitions |
| `libs/authorization/src/lib/permissions.ts` | `defineAbilityFor` - CASL ability factory  |

### Frontend

| File                                                     | Description                                            |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `apps/notes/src/routes/_authenticated/notes.$noteId.tsx` | Authenticated note editor route                        |
| `apps/notes/src/routes/shared.$token.tsx`                | Public shared note route                               |
| `apps/notes/src/pages/NoteEditorPage.tsx`                | Editor with access-based UI                            |
| `apps/notes/src/pages/SharedNotePage.tsx`                | Shared note view                                       |
| `apps/notes/src/components/notes/ShareDialog.tsx`        | Share dialog (general access, permissions)             |
| `libs/api-client/src/lib/notes.api.ts`                   | API client methods                                     |
| `libs/data-access/notes/src/notes.hooks.ts`              | React Query hooks (`useNotes`, `useNoteByToken`, etc.) |
