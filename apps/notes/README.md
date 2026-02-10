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
- [Frontend Architecture](#frontend-architecture)
- [Components](#components)
- [State Management](#state-management)
- [Real-time Collaboration](#real-time-collaboration)
- [Testing](#testing)
- [Building for Production](#building-for-production)

---

## Features

| Feature              | Description                                    |
| -------------------- | ---------------------------------------------- |
| 🔐 Authentication    | Login, register, and protected routes with JWT |
| 📝 Rich Text Editor  | Tiptap-based editor with formatting toolbar    |
| 🔄 Real-time Sync    | CRDT-based collaboration using Yjs             |
| 👥 Live Presence     | See collaborators' cursors and selections      |
| 📱 Responsive Design | Mobile-first, works on all devices             |
| 🌙 Dark Mode         | System-aware theme switching                   |
| 💾 Offline Support   | IndexedDB persistence for offline editing      |
| ⚡ Fast Performance  | Optimized with React 19 and Vite               |

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
pnpm dev:all      # API + Notes app
```

---

## Project Structure

```
apps/notes/
├── src/
│   ├── components/           # Feature components
│   │   ├── auth/            # Route guards
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── PublicRoute.tsx
│   │   ├── editor/          # Rich text editor
│   │   │   ├── CollaborativeEditor.tsx
│   │   │   ├── EditorToolbar.tsx
│   │   │   └── cursors/     # Cursor rendering
│   │   ├── layout/          # Layout components
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── NavigationLinks.tsx
│   │   │   └── SidebarUserFooter.tsx
│   │   └── notes/           # Notes list & management
│   │       ├── NoteCard.tsx
│   │       ├── NoteList.tsx
│   │       ├── CreateDialog.tsx
│   │       ├── DeleteDialog.tsx
│   │       └── EmptyState.tsx
│   │
│   ├── pages/               # Page components
│   │   ├── HomePage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── NoteEditorPage.tsx
│   │
│   ├── routes/              # TanStack Router routes
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── notes.$noteId.tsx
│   │
│   ├── providers/           # React context providers
│   │   ├── YjsProvider.tsx  # Yjs document management
│   │   ├── YjsContext.ts    # Context definition
│   │   ├── useYjs.ts        # Context hook
│   │   └── ThemeProvider.tsx # Dark/light theme
│   │
│   ├── hooks/               # App-specific hooks
│   │   ├── useActiveCollaborators.ts
│   │   ├── useCollaborativeEditor.ts
│   │   ├── useWebSocketCollaboration.ts
│   │   └── usePresenceBroadcast.ts
│   │
│   ├── lib/                 # Utilities
│   │   ├── date.ts
│   │   ├── text.ts
│   │   ├── collaboration.ts
│   │   ├── collaboration.constants.ts
│   │   └── constants.ts
│   │
│   ├── config/              # App configuration
│   │   └── navigation.config.ts
│   │
│   ├── types/               # TypeScript types
│   │   ├── editor.ts
│   │   └── collaboration.ts
│   │
│   └── main.tsx
│
├── vite.config.ts
├── vitest.config.ts
└── tsconfig.json
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

### Component Hierarchy

```
<App>
  └── <Providers>
        ├── <ThemeProvider>          # Dark/light mode
        └── <YjsProvider>           # Collaboration documents
              └── <RouterProvider>
                    └── <RootLayout>
                          ├── <Sidebar />
                          └── <Outlet />
                                ├── <HomePage />
                                ├── <LoginPage />
                                ├── <RegisterPage />
                                └── <NoteEditorPage />
```

### Data Flow

```
User Action
    ↓
Page/Component
    ↓
Custom Hook (useNotes, useLogin, etc.)
    ↓
├── React Query (API calls via @knowtis/api-client)
└── Zustand Store (local state via @knowtis/data-access)
    ↓
API Response / State Update
    ↓
Component Re-render
```

---

## Components

### Pages

| Page             | Route        | Auth Required | Description           |
| ---------------- | ------------ | ------------- | --------------------- |
| `HomePage`       | `/`          | Yes           | Notes dashboard       |
| `LoginPage`      | `/login`     | No            | User login form       |
| `RegisterPage`   | `/register`  | No            | User registration     |
| `NoteEditorPage` | `/notes/:id` | Yes           | Rich text note editor |

### Key Components

#### `ProtectedRoute`

Wraps routes that require authentication. Redirects to `/login` if user is not authenticated.

```tsx
<ProtectedRoute>
  <HomePage />
</ProtectedRoute>
```

#### `NoteEditor`

Rich text editor powered by Tiptap with collaboration support.

```tsx
<NoteEditor
  noteId={noteId}
  yDoc={yDoc}
  provider={provider}
  onSave={handleSave}
/>
```

#### `EditorToolbar`

Formatting toolbar for the rich text editor.

```tsx
<EditorToolbar editor={editor} />
```

---

## State Management

### Server State (TanStack Query)

Server data is managed via React Query hooks from `@knowtis/data-access-notes`:

```typescript
import {
  useCreateNote,
  useDeleteNote,
  useNote,
  useNotes,
  useUpdateNote,
} from '@knowtis/data-access-notes';
```

These hooks provide caching, optimistic updates, and automatic refetching.

### Client State (Zustand)

Authentication state is managed via Zustand from `@knowtis/auth`:

```typescript
import { useAuthStore } from '@knowtis/auth';
```

The auth store manages user session, tokens, and authentication status.

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

### Test Structure

```
src/
├── components/
│   └── notes/
│       ├── NoteCard.tsx
│       └── NoteCard.test.tsx     # Component test
├── hooks/
│   └── useAutoSave.ts
│       └── useAutoSave.test.ts   # Hook test
└── test/
    └── setup.ts                  # Test setup
```

### Testing Libraries

- **Vitest** - Test runner
- **React Testing Library** - Component testing
- **@testing-library/user-event** - User interaction simulation

---

## Building for Production

### Build Command

```bash
# From workspace root
pnpm build

# Or directly
nx build notes
```

### Output

Build artifacts are generated in `dist/apps/notes/`:

```
dist/apps/notes/
├── index.html
├── assets/
│   ├── index.[hash].js
│   └── index.[hash].css
└── ...
```

### Preview Production Build

```bash
pnpm preview
# or
nx preview notes
```

### Deployment

The built app is a static site that can be deployed to:

- **Vercel** (configured via `vercel.json`)
- **Netlify**
- **AWS S3 + CloudFront**
- **Any static hosting**

#### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

#### Environment Variables for Production

Set these in your hosting provider:

```env
VITE_API_URL=https://api.your-domain.com/api/v1
VITE_WS_URL=https://api.your-domain.com
VITE_COLLABORATION_MODE=websocket
```

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
