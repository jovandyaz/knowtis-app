# Notes App

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-38B2AC?style=flat-square&logo=tailwindcss" alt="TailwindCSS" />
</p>

**The Notes App** is a modern, real-time collaborative notes application built with React 19. It features rich text editing, live collaboration, and offline support.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Architecture](#frontend-architecture)
- [Components](#components)
- [Real-time Collaboration](#real-time-collaboration)
- [Testing](#testing)
- [Building for Production](#building-for-production)

---

## Features

| Feature                 | Description                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔐 Authentication       | Login, register, forgot/reset password, email verification, protected routes with JWT                                                                                                                      |
| 📝 Rich Text Editor     | Tiptap-based editor with formatting toolbar, heading dropdown, link popover, code blocks                                                                                                                   |
| 🤖 AI Writing Assistant | Bubble menu AI actions (improve, fix spelling, summarize, translate, expand, change tone)                                                                                                                  |
| ✨ AI Slash Commands    | `/` commands to trigger AI actions, generate study tools, and insert voice notes inline                                                                                                                    |
| 👻 Ghost Text           | AI-powered autocomplete suggestions displayed as inline ghost text while typing                                                                                                                            |
| 🧩 AI Blocks            | Custom editor nodes for inline AI content generation with streaming status                                                                                                                                 |
| 💬 AI Copilot           | Conversational side-panel agent that reads and edits notes with approval (HITL); account-default model selection (by model or by intent), per-turn reasoning effort, and bring-your-own-key (BYOK) billing |
| 📊 Artifacts & Study    | AI-generated flashcards, quizzes, summaries, and mind maps in a dedicated sidebar                                                                                                                          |
| 🃏 Spaced Repetition    | SM2 algorithm for flashcard review with advanced rating, progress tracking, and missed cards                                                                                                               |
| 🎙️ Voice Notes          | Voice recording with live audio preview, transcription, and editor insertion                                                                                                                               |
| 🔗 Note Sharing         | Share notes via link with configurable access levels (viewer/editor), editors-can-share toggle                                                                                                             |
| 👤 Anonymous Mode       | Try the app without an account with usage limit modal and upgrade prompts                                                                                                                                  |
| 🔄 Real-time Sync       | CRDT-based collaboration using Yjs                                                                                                                                                                         |
| 👥 Live Presence        | See collaborators' cursors and selections                                                                                                                                                                  |
| ⚙️ Settings             | Modal with profile, account, appearance (theme), language, AI Assistant (copilot model + your provider keys), and MCP integrations sections                                                                |
| 🌐 Internationalization | i18n support with English and Spanish via react-i18next                                                                                                                                                    |
| 📱 Responsive Design    | Mobile-first with bottom nav and floating action button                                                                                                                                                    |
| 🌙 Dark Mode            | System-aware theme switching                                                                                                                                                                               |
| 💾 Offline Support      | IndexedDB persistence for offline editing                                                                                                                                                                  |
| 📈 Analytics            | PostHog integration for product analytics                                                                                                                                                                  |
| ⚡ Fast Performance     | Optimized with React 19 and Vite                                                                                                                                                                           |

---

## Quick Start

### Prerequisites

Ensure the backend API is running. See the [root README](../../README.md) for full setup instructions.

### Development

```bash
# From workspace root
pnpm dev

# Or using Nx directly
nx serve notes
```

The app will be available at **http://localhost:4200**

### With Backend

```bash
# Start everything
pnpm docker:up    # Database
pnpm dev:all      # API + Notes + Backoffice
```

---

## Project Structure

```
src/
├── components/       # Feature components (editor, ai, copilot, artifacts, voice-note, settings, layout, notes, anonymous)
├── pages/            # Route page components
├── routes/           # TanStack Router file-based routes
├── providers/        # React context providers (Yjs, Theme, PostHog, CASL)
├── stores/           # Zustand stores (ai, agent, artifacts, sidebar, settings, voice-note)
├── hooks/            # App-specific hooks (collaboration, voice, auto-title)
├── auth/             # Auth adapters and anonymous session
├── lib/              # Utilities (i18n, query-client, collaboration)
├── config/           # Navigation, routes, storage keys
└── types/            # TypeScript type definitions
```

---

## Configuration

### Environment Variables

Create a `.env` file in `apps/notes/`:

```env
# API Configuration
VITE_API_URL=http://localhost:3333/api/v1
VITE_WS_URL=http://localhost:3333

# Collaboration Mode
# Options: 'webrtc' | 'websocket' | 'hybrid'
#
# - webrtc:    P2P only, works offline (no backend needed)
# - websocket: Server-based only (requires API)
# - hybrid:    WebSocket primary, WebRTC fallback
VITE_COLLABORATION_MODE=websocket
```

### Collaboration Modes

| Mode        | Backend Required | Offline | Description                       |
| ----------- | ---------------- | ------- | --------------------------------- |
| `webrtc`    | No               | Yes     | Peer-to-peer via WebRTC signaling |
| `websocket` | Yes              | No      | Server-based sync via Socket.io   |
| `hybrid`    | Optional         | Yes     | WebSocket with WebRTC fallback    |

---

## Frontend Architecture

### Data Flow

```
User Action → Component → Custom Hook → React Query / Zustand → Re-render
```

- **Server state**: React Query hooks from `@knowtis/data-access-notes` (caching, optimistic updates)
- **Client state**: Zustand stores in `src/stores/` (UI state, AI state, sidebar)

---

## Components

### Pages

| Page                 | Route              | Auth Required | Description                  |
| -------------------- | ------------------ | ------------- | ---------------------------- |
| `HomePage`           | `/`                | Yes           | Notes dashboard              |
| `LoginPage`          | `/login`           | No            | User login form              |
| `RegisterPage`       | `/register`        | No            | User registration            |
| `ForgotPasswordPage` | `/forgot-password` | No            | Password reset request       |
| `ResetPasswordPage`  | `/reset-password`  | No            | Password reset form          |
| `VerifyEmailPage`    | `/verify-email`    | No            | Email verification           |
| `NoteEditorPage`     | `/notes/:id`       | Yes           | Rich text note editor        |
| `SharedNotePage`     | `/s/:token`        | No            | Shared note access via token |
| `WelcomePage`        | `/`                | No            | Landing page for new users   |

### Key Component Areas

| Area                 | Description                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor/`            | Tiptap collaborative editor with toolbar, cursors, save indicator                                                                                                                                 |
| `editor/ai/`         | AI bubble menu, slash commands, streaming preview                                                                                                                                                 |
| `editor/extensions/` | Ghost text autocomplete, AI blocks, code blocks                                                                                                                                                   |
| `artifacts/`         | Study tools sidebar (flashcards with SM2, quizzes, summaries, mind maps)                                                                                                                          |
| `voice-note/`        | Voice recording, live preview, transcription                                                                                                                                                      |
| `notes/`             | Note list, cards, sharing dialog                                                                                                                                                                  |
| `copilot/`           | Conversational agent panel — composer, message list, proposal cards, source chips, retry banner, and the model/effort picker (`CopilotModelPicker`, `IntentModelPicker`, `intent-picker-options`) |
| `settings/`          | Profile, account, appearance, language, AI Assistant (copilot model + BYOK keys), MCP integrations                                                                                                |
| `layout/`            | Sidebar, bottom nav (mobile), floating action button                                                                                                                                              |
| `anonymous/`         | Usage limit modal for unauthenticated users                                                                                                                                                       |

---

## Real-time Collaboration

### Technology Stack

| Technology | Purpose                                     |
| ---------- | ------------------------------------------- |
| Yjs        | CRDT for conflict-free data synchronization |
| Tiptap     | Rich text editor with Yjs integration       |
| Socket.io  | WebSocket transport for server sync         |
| WebRTC     | Peer-to-peer transport for offline mode     |
| IndexedDB  | Local persistence for offline support       |

### How It Works

1. **Document Creation**: Each note has a `Y.Doc` (Yjs document)
2. **Content Storage**: Text stored as `Y.XmlFragment` (ProseMirror compatible)
3. **Synchronization**:
   - Changes broadcast via WebSocket or WebRTC
   - Conflicts resolved automatically by CRDT algorithm
4. **Persistence**:
   - Remote: Saved to PostgreSQL via API
   - Local: Cached in IndexedDB

### Awareness (Live Presence)

Collaborators see each other's:

- Cursor positions
- Text selections
- User info (name, avatar, color)

```typescript
// In YjsProvider
provider.awareness.setLocalStateField('user', {
  name: currentUser.name,
  color: userColor,
  cursor: cursorPosition,
});
```

### Testing Collaboration

#### Local (Multiple Tabs)

1. Open the app in your browser
2. Create or select a note
3. Open the same URL in another tab
4. Edit in both tabs simultaneously
5. Changes sync in real-time via BroadcastChannel

#### Remote (Multiple Users)

1. Share the note URL with another user
2. Both users can edit simultaneously
3. Changes sync via WebSocket server

---

## Testing

### Running Tests

```bash
# Watch mode
nx test notes

# Single run
nx test notes --run

# With coverage
nx test notes --coverage

# Specific file
nx test notes --testPathPattern=NoteCard
```

Tests are co-located with source files (`*.test.tsx`). Uses Vitest + React Testing Library.

---

## Building for Production

### Build Command

```bash
# From workspace root
pnpm build

# Or directly
nx build notes
```

Output: `dist/apps/notes/`. Deployed to Vercel (see [Deployment Guide](../../docs/DEPLOYMENT.md)).

---

## Related Documentation

- [Root README](../../README.md) - Workspace overview
- [API Documentation](../api/README.md) - Backend API
- [Architecture Guide](../../docs/ARCHITECTURE.md) - System design
- [Deployment Guide](../../docs/DEPLOYMENT.md) - Railway & Vercel

---

<p align="center">
  Part of the <strong>Knowtis</strong> monorepo
</p>
