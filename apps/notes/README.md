# Notes App

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-38B2AC?style=flat-square&logo=tailwindcss" alt="TailwindCSS" />
</p>

Real-time collaborative notes frontend: Tiptap editor on a Yjs document, AI writing tools and copilot, study artifacts, voice notes, note sharing and an anonymous try-it mode. Runs on http://localhost:4200.

## Features

| Feature              | Description                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | Login, register, forgot/reset password, email verification (link or code); anonymous session for visitors without an account                |
| Rich text editor     | Tiptap editor from `@knowtis/editor`: toolbar, code blocks, Mermaid diagrams, tables, images, tags                                          |
| AI writing assistant | Bubble menu actions (improve, fix spelling, shorter/longer, action items, translate, tone, summarize)                                       |
| AI slash commands    | `/` menu with formatting blocks plus AI actions (continue, outline, learn, study tools, voice note)                                         |
| Ghost text           | Inline autocomplete suggestions while typing                                                                                                |
| AI blocks            | Editor nodes for inline AI generation with streaming status                                                                                 |
| AI copilot           | Right-dock agent that reads and edits notes with approval (HITL); default model by model or by intent, per-turn reasoning effort, BYOK keys |
| Artifacts and study  | Flashcards (SM2 review, missed cards), quizzes, summaries, mind maps in a sidebar                                                           |
| Voice notes          | Recording with live preview, transcription, insertion into the editor                                                                       |
| Organization         | Buckets, tags, supertags and list views on `/notes`                                                                                         |
| Note sharing         | Share links with viewer/editor access and an editors-can-share toggle                                                                       |
| Real-time sync       | Yjs CRDT over Hocuspocus, live cursors, IndexedDB persistence (see [Collaboration](#collaboration))                                         |
| Settings             | Profile, account, appearance, language, AI assistant (copilot model + provider keys), integrations (MCP keys, connected apps)               |
| i18n                 | English and Spanish via react-i18next                                                                                                       |
| Dark mode            | System-aware theme                                                                                                                          |
| Analytics            | PostHog (disabled when the key is empty)                                                                                                    |

## Quick Start

```bash
pnpm dev          # nx serve notes -> http://localhost:4200
pnpm docker:up    # PostgreSQL + Redis
pnpm dev:all      # notes + api + backoffice
```

The API must be running for auth, notes and collaboration. See the [root README](../../README.md).

## Configuration

Copy `.env.example` to `.env` in `apps/notes/`:

| Variable                   | Purpose                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`             | REST base URL. Default `http://localhost:3333/api/v1` (`libs/api-client/src/lib/config.ts`)                                                        |
| `VITE_WS_URL`              | WebSocket base. When unset it is derived from `VITE_API_URL`; the app appends `/collaboration` (`src/collaboration/useHocuspocusCollaboration.ts`) |
| `VITE_COLLABORATION_MODE`  | `websocket` or `hybrid` connects to Hocuspocus; any other value keeps the editor local-only. Use `websocket`                                       |
| `VITE_MCP_URL`             | MCP connector URL shown in Settings > Integrations (`McpConnectCard.tsx`). Default `https://mcp.knowtis.app/mcp`                                   |
| `VITE_PUBLIC_POSTHOG_KEY`  | PostHog project key; empty disables analytics (`src/lib/posthog.ts`)                                                                               |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog host; defaults to the `/t` reverse proxy                                                                                                   |

## Project Structure

```
src/
├── auth/             # Auth adapters, initAuth, anonymous/guest session, verify-email guard
├── collaboration/    # useHocuspocusCollaboration, collaboration token provider
├── components/       # AppErrorBoundary, ai-elements, anonymous, artifacts, auth, copilot, editor,
│                     # layout, notes, oauth, organization, right-dock, settings, voice-note
├── config/           # ROUTES, navigation, storage keys
├── hooks/            # App hooks (collaborative editor, voice recorder, auto-title, provider keys, ...)
├── lib/              # i18n, query-client, posthog, sanitize-ai-html, note-permissions
├── pages/            # Page components mounted by routes
├── providers/        # AppProviders, PostHogProvider, ThemeProvider, CASL ability provider
├── routes/           # TanStack Router file-based routes
├── stores/           # Zustand: agent, ai, ai-menu, anonymous-limit, artifact-sidebar, chunk-buffer,
│                     # notes-search, right-dock, settings, sidebar, verify-email, voice-note-editor, workspace
└── types/
```

Editor extensions (ghost text, AI block, code block, Mermaid, image, suggestion menu) live in `packages/editor`; the Yjs provider lives in `packages/crdt`.

## Routes

Routes under `_app` run `initAuth()` first: it restores a stored session or creates an anonymous one, so they work without an account unless noted.

| Route              | Component            | Session      | Notes                                                     |
| ------------------ | -------------------- | ------------ | --------------------------------------------------------- |
| `/`                | `RootRedirect`       | anonymous ok | Creates a note and navigates to it                        |
| `/notes`           | `HomePage`           | anonymous ok | Notes list with bucket/tag/view search                    |
| `/notes/$noteId`   | `NoteEditorPage`     | anonymous ok | Collaborative editor                                      |
| `/dashboard`       | `WelcomePage`        | anonymous ok | Greeting, recent notes                                    |
| `/oauth/consent`   | `OauthConsentRoute`  | account      | Redirects anonymous visitors to `/login`                  |
| `/s/$token`        | `SharedNotePage`     | public       | Shared note by token                                      |
| `/login`           | `LoginPage`          | public       | Signed-in accounts are redirected away                    |
| `/register`        | `RegisterPage`       | public       |                                                           |
| `/forgot-password` | `ForgotPasswordPage` | public       |                                                           |
| `/reset-password`  | `ResetPasswordPage`  | public       | `?token=`                                                 |
| `/verify-email`    | `VerifyEmailPage`    | public       | Signed-in accounts are sent to `/dashboard` (code dialog) |

Unknown paths redirect to `/`.

## Collaboration

- Transport: `@hocuspocus/provider` over WebSocket at `${VITE_WS_URL}/collaboration`; enabled when `VITE_COLLABORATION_MODE` is `websocket` or `hybrid`.
- Persistence: every note document is stored in IndexedDB and synced across tabs by `@knowtis/crdt`, regardless of mode.
- Socket.io is used only for the `/ai` and `/agent` streams (`libs/api-client`), not for document sync.

Details: [Architecture: Real-time Collaboration](../../docs/ARCHITECTURE.md#real-time-collaboration) and [packages/crdt](../../packages/crdt/README.md).

## Testing

```bash
nx test notes                         # single run (@nx/vitest:test)
nx test notes --watch
nx test notes --coverage
nx test notes --testFiles=src/components/notes/NoteList.test.tsx
```

Vitest + React Testing Library. Tests are `*.test.tsx`, `*.spec.ts` and `__tests__/` directories next to the source.

## Build

```bash
pnpm build        # nx build notes -> dist/apps/notes/
```

Deployed to Vercel from CI; see the [Deployment Guide](../../docs/DEPLOYMENT.md).

## Related Documentation

- [Root README](../../README.md)
- [API](../api/README.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Deployment](../../docs/DEPLOYMENT.md)
