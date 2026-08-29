# Permissions & Sharing

This document describes how note permissions, access control, and sharing work in Knowtis using the **General Access** model (similar to Google Docs).

The permission system is built on a layered package architecture. For package internals, see [PERMISSIONS-PACKAGES.md](PERMISSIONS-PACKAGES.md).

---

## Table of Contents

1. [Access Levels](#access-levels)
2. [Sharing Mechanisms](#sharing-mechanisms)
3. [Access Validation](#access-validation)
4. [Verified Email Gate](#verified-email-gate)
5. [WebSocket Collaboration Permissions](#websocket-collaboration-permissions)
6. [API Endpoints](#api-endpoints)
7. [Frontend Behavior](#frontend-behavior)
8. [Access Matrix](#access-matrix)
9. [Database Schema](#database-schema)
10. [Key Files Reference](#key-files-reference)

---

## Access Levels

Knowtis defines three access levels:

| Level      | Value    | Stored in DB                        | Description                     |
| ---------- | -------- | ----------------------------------- | ------------------------------- |
| **Owner**  | `owner`  | No (derived from `notes.ownerId`)   | Full control over the note      |
| **Editor** | `editor` | Yes (`note_permissions.permission`) | Can read and edit content/title |
| **Viewer** | `viewer` | Yes (`note_permissions.permission`) | Read-only access                |

The `owner` level is computed at runtime by comparing `note.ownerId` with the current user ID. Only `viewer` and `editor` are persisted as a PostgreSQL enum (`permission_level`).

These are defined in `packages/shared/types/src/lib/note.types.ts`:

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

- A unique `shareToken` (128-bit, 32-char hex via `crypto.randomBytes(16)`) is generated the first time the note is shared, and reused from then on
- The `generalAccessPermission` determines what people with the link can do:
  - **Viewer**: Read-only access
  - **Editor**: Can read and edit
- The share link is: `${origin}/s/${shareToken}`

Key features:

- **Single token per note**: Unlike the old model, there's only one share link per note
- **No expiration**: A link never expires on its own
- **Permanent token**: The token is minted the first time the note is shared and kept for the life of the note. Setting access back to "Restricted" disables the link without clearing the token, so re-enabling resumes the same URL
- **Public access**: Shared notes can be accessed without authentication via `/s/:token`

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

Access is validated at multiple layers: HTTP handlers, the repository, and the Hocuspocus WebSocket handshake.

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

## Verified Email Gate

Five actions that widen what an account or a note gives away additionally require a **verified, non-anonymous identity**. `VerifiedIdentityPolicy` (`apps/api/src/modules/users/verified-identity.policy.ts`) decides it behind the `email_verification_gate` feature flag: while the flag is off the policy answers _allow_ for everyone, so the gate ships dark, and a toggle takes effect within the flag cache window (30 s, invalidated on write).

| Site                                              | Where the check sits                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Share a note with a user (`ShareNoteHandler`)     | Before any lookup                                              |
| Widen a note's link (`UpdateNoteHandler`)         | After the ownership check, only when the link's exposure grows |
| Create an MCP API key (`McpKeysService`)          | First statement of `createKey`                                 |
| Store a BYOK provider key (`ByokService`)         | Before the provider round-trip that validates the key          |
| Copilot share approval (`ApproveMutationHandler`) | Before the target email is resolved                            |

The positions differ on purpose:

- **Widening a link** is gated after the ownership check because a non-owner is refused for lacking the right at all — the truer answer than telling them to verify — and only when the link's _exposure_ grows. Exposure is ranked `closed < anyone-with-link / viewer < anyone-with-link / editor` (`linkExposureRank`, `notes/domain/value-objects/link-exposure.ts`), so opening a link, granting write to an open link, or both in one update need a verified email, while closing or lowering a link never does: an unverified owner must always be able to revoke a link they already exposed.
- **Copilot share approval** checks before resolving the target email; resolving first would reveal whether that account exists.

The refusal is `403 EMAIL_NOT_VERIFIED` over HTTP and `AGENT_EMAIL_NOT_VERIFIED` over the copilot socket, both defined once in `@knowtis/shared-types`.

Because the policy also refuses anonymous users, turning the flag on removes link-sharing from every anonymous visitor at once. They are never offered a verify prompt — there is no address to verify.

---

## WebSocket Collaboration Permissions

Real-time collaboration runs on **Hocuspocus** (the official Yjs WebSocket server) rather than a custom Socket.io gateway. Documents sync as **Yjs (CRDT)** updates, and Hocuspocus binds to the same Node HTTP server as the REST API — only the upgrade path differs (`/collaboration`). Access is enforced once, at the WebSocket handshake, via a Hocuspocus extension.

### Components

- `hocuspocus.service.ts` — `@Injectable()` service that instantiates the Hocuspocus `Server`, forwards `'upgrade'` events whose URL starts with `/collaboration`, and registers the auth + persistence extensions (plus `@hocuspocus/extension-redis` for multi-instance fan-out when `REDIS_URL` is set).
- `extensions/hocuspocus-auth.extension.ts` — implements the `onAuthenticate` hook; this is where access is authenticated and enforced.
- `extensions/hocuspocus-persistence.extension.ts` — loads/stores the `Y.Doc` from `notes.yjs_state`.

### Handshake Authentication & Enforcement (`HocuspocusAuthExtension`)

Access is checked in the `onAuthenticate` hook. Throwing from the hook aborts the handshake, and the thrown message becomes the close `reason` the client receives. The flow (`authenticate`):

1. **Verify the JWT** (`JwtService.verify`, HS256). A missing or invalid token throws (`Authentication required` / `Invalid token`). MCP-sourced tokens (`source === TOKEN_SOURCE_MCP`) are rejected for the collaboration handshake (`Forbidden`). Anonymous users authenticate through the same path with an anonymous JWT.
2. **Load the user** via `UsersService.findById`.
3. **Load the note** via `NoteRepository.findById` (throws `Note not found` if missing) and its permissions via `findPermissionsByNote`, in parallel. Unexpected repo/DB errors are normalized to `Internal server error` so raw error details never reach the client as a close reason.
4. **Build the `SharedNote[]` list** (`buildSharedNotes`) combining (a) the current user's DB-stored direct permissions and (b) a synthetic entry when a valid `?shareToken=` URL parameter matches an `ANYONE_WITH_LINK` note — keeping a single permission-evaluation path.
5. **Evaluate CASL** (`defineAbilityFor`) and gate the note subject (`enforcePermissions`):
   - If `cannot('read', note)` → throw `Forbidden` (handshake rejected).
   - If `cannot('update', note)` → set `connectionConfig.readOnly = true`.

The same `hasAccess`/permission semantics used by the HTTP layer are reused here through the shared `defineAbilityFor` ability — there is no separate WS access path.

### Read-only Connections

When the user can read but not edit, `connectionConfig.readOnly = true` is set during `onAuthenticate`. Hocuspocus then rejects document writes from that connection at the protocol level — the client receives `scope: 'readonly'` via `onAuthenticated`. The frontend uses this to call `editor.setEditable(false)`, but enforcement is server-side; the client cannot bypass it.

### Share-token Access

For link-shared notes, the frontend appends `?shareToken=xxx` to the provider URL. The auth extension reads it from `requestParameters`; it grants the note's `generalAccessPermission` (`viewer`/`editor`) only when the note's `generalAccess` is `ANYONE_WITH_LINK` **and** its `shareToken` matches. Otherwise the parameter contributes no access and standard CASL gating applies.

### Token Expiry

When the JWT carries an `exp` claim, `armExpiryDisconnect` schedules a close (`code: 4401`, `reason: 'Token expired'`) shortly after expiry (plus a grace window). The frontend provider refetches a fresh token on reconnect.

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

When `generalAccess` is changed to `'anyone_with_link'` and no `shareToken` exists, one is generated. The token is then **permanent**: changing back to `'restricted'` leaves it in place, so re-enabling sharing resumes the same link instead of minting a different one.

A retained token grants nothing on its own. Every reader gates on `generalAccess` as well — `findByShareToken` (REST), the Hocuspocus handshake, and the shared-artifacts query all require `'anyone_with_link'` — so a restricted note's token resolves to a 404 until sharing is re-enabled. The consequence to be aware of: there is no way to invalidate a leaked link, because re-sharing revives every link previously handed out.

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

| Code                    | HTTP Status | Description                                                                                |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `NOTE_NOT_FOUND`        | 404         | Note does not exist                                                                        |
| `PERMISSION_DENIED`     | 403         | User lacks required permission (incl. owner-only operations, via `NoteErrors.ownerOnly()`) |
| `SHARE_TOKEN_NOT_FOUND` | 404         | Token does not match or access is restricted                                               |
| `INVALID_PERMISSION`    | 400         | Invalid permission level                                                                   |
| `EMAIL_NOT_VERIFIED`    | 403         | The action needs a verified email (see [Verified Email Gate](#verified-email-gate))        |

---

## Frontend Behavior

### Routes

| Route                 | Auth Required | Description                                |
| --------------------- | ------------- | ------------------------------------------ |
| `/_app/notes/$noteId` | Yes           | Full note editor (owns or has permissions) |
| `/s/$token`           | No            | Shared note view via token                 |

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

3. **Copy Link Button** (visible when "Anyone with the link" is selected):
   - Copies `${origin}/s/${shareToken}` to clipboard
   - A restricted note may still hold a token; the link stays hidden until sharing is on

4. **Editors Can Share Toggle** (owner only):
   - Allows editors to manage sharing

5. **Info Badge** (for non-owners):
   - Displays sharing capabilities based on `editorsCanShare`

### Shared Note Page (`/s/:token`)

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
| `packages/shared/types/src/lib/note.types.ts`                            | Permission/access constants and types       |
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

| File                                                                          | Description                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/api/src/modules/notes/application/queries/get-notes.handler.ts`         | List accessible notes (dashboard)                                   |
| `apps/api/src/modules/notes/application/queries/get-note.handler.ts`          | Get single note with access level                                   |
| `apps/api/src/modules/notes/application/queries/get-note-by-token.handler.ts` | Public note access via share token                                  |
| `apps/api/src/modules/notes/application/commands/update-note.handler.ts`      | Update with permission checks, mints the share token on first share |
| `apps/api/src/modules/notes/application/commands/share-note.handler.ts`       | Grant direct permission (upsert), respects editorsCanShare          |
| `apps/api/src/modules/notes/application/commands/revoke-access.handler.ts`    | Remove direct permission                                            |
| `apps/api/src/modules/notes/application/queries/get-collaborators.handler.ts` | List users with access                                              |

### WebSocket

| File                                                                                | Description                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/api/src/modules/collaboration/hocuspocus.service.ts`                          | Hocuspocus server lifecycle, `/collaboration` upgrade forwarding, extensions |
| `apps/api/src/modules/collaboration/extensions/hocuspocus-auth.extension.ts`        | `onAuthenticate`: JWT/share-token auth + CASL read/update enforcement        |
| `apps/api/src/modules/collaboration/extensions/hocuspocus-persistence.extension.ts` | `onLoadDocument`/`onStoreDocument`: hydrate + persist `Y.Doc`                |

### Authorization & Permissions Packages

| File                                        | Description                                               |
| ------------------------------------------- | --------------------------------------------------------- |
| `packages/permissions/`                     | Core: `Ability` types, `definePermissions`, `RoleManager` |
| `packages/permissions-nestjs/`              | NestJS: `PoliciesGuard`, `@RequirePermission` decorator   |
| `packages/permissions-react/`               | React: `createPermissionContext` (provider, hooks, `Can`) |
| `libs/authorization/src/lib/types.ts`       | App types: `AppAbility`, `Action`, `Subject`, `AuthUser`  |
| `libs/authorization/src/lib/permissions.ts` | `defineAbilityFor` — builds ability from user + context   |
| `libs/authorization/src/lib/roles.ts`       | `appRoleManager` — pre-defined role templates             |

> Package internals documented in [PERMISSIONS-PACKAGES.md](PERMISSIONS-PACKAGES.md).

### Frontend

| File                                              | Description                                            |
| ------------------------------------------------- | ------------------------------------------------------ |
| `apps/notes/src/routes/_app/notes/$noteId.tsx`    | Authenticated note editor route                        |
| `apps/notes/src/routes/s.$token.tsx`              | Public shared note route                               |
| `apps/notes/src/pages/NoteEditorPage.tsx`         | Editor with access-based UI                            |
| `apps/notes/src/pages/SharedNotePage.tsx`         | Shared note view                                       |
| `apps/notes/src/components/notes/ShareDialog.tsx` | Share dialog (general access, permissions)             |
| `libs/api-client/src/lib/notes.api.ts`            | API client methods                                     |
| `libs/data-access/notes/src/notes.hooks.ts`       | React Query hooks (`useNotes`, `useNoteByToken`, etc.) |
