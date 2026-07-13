# Knowtis

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" /></a>
  <a href="https://github.com/jovandyaz/knowtis_app/stargazers"><img src="https://img.shields.io/github/stars/jovandyaz/knowtis_app?style=for-the-badge" alt="GitHub Stars" /></a>
  <a href="https://github.com/jovandyaz/knowtis_app/issues"><img src="https://img.shields.io/github/issues/jovandyaz/knowtis_app?style=for-the-badge" alt="GitHub Issues" /></a>
  <a href="https://github.com/jovandyaz/knowtis_app/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/jovandyaz/knowtis_app/ci.yml?style=for-the-badge&label=CI" alt="CI Status" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Nx-22.3-blue?style=for-the-badge&logo=nx" alt="Nx" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
</p>

<p align="center">
  <strong>AI-powered collaborative notes platform — your notes are your knowledge base</strong>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Running the Project](#running-the-project)
- [Available Scripts](#available-scripts)
- [Architecture](#architecture)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Knowtis** is an AI-powered collaborative workspace that turns your notes into a knowledge base:

- 🤖 **AI Assistant** - Improve writing, fix spelling, summarize, translate, and expand content with inline AI actions
- 💬 **AI Copilot** - Conversational assistant that reads and edits your notes with approval (HITL), with per-conversation model selection and bring-your-own-key (BYOK) billing
- 🧠 **Study Tools** - Auto-generate flashcards, quizzes, summaries, and mind maps from your notes
- 🃏 **Spaced Repetition** - SM2 algorithm for optimal flashcard review scheduling
- 📝 **Rich Text Editing** - Tiptap/ProseMirror with slash commands, ghost text suggestions, and AI blocks
- 🔄 **Real-time Collaboration** - CRDT-based sync using Yjs with live presence and remote cursors
- 🎙️ **Voice Notes** - Record and transcribe voice notes with AI processing
- 🌐 **Offline Support** - IndexedDB persistence with optimistic local-first updates
- 🔐 **Secure Authentication** - JWT-based auth with HttpOnly cookie refresh tokens
- 🌍 **Internationalization** - Full i18n support (English and Spanish)
- 🔌 **MCP Integration** - Model Context Protocol server for AI assistant workflows
- 🎨 **Modern UI** - Tailwind CSS 4 with dark mode, resizable panels, and responsive design

---

## Quick Start

### Prerequisites

| Requirement | Version |
| ----------- | ------- |
| Node.js     | ≥ 22.x  |
| pnpm        | ≥ 10.x  |
| Docker      | ≥ 20.x  |

### Setup

```bash
git clone git@github.com:jovandyaz/knowtis_app.git
cd knowtis_app
pnpm setup       # installs deps, scaffolds .env files, starts Docker, pushes the schema
pnpm dev:all     # starts the API + frontend
```

> `pnpm setup` is idempotent — it never overwrites an existing `.env`. AI features (`/api/ai/*`) need an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `apps/api/.env` after the first run.

Design-system tokens are regenerated automatically before the app starts (the `serve`/`build` targets depend on `design-system:build`), so `pnpm dev:all` works on a fresh clone with no extra step.

To run apps individually instead:

```bash
pnpm dev      # Frontend only (http://localhost:4200)
pnpm dev:api  # Backend only (http://localhost:3333)
pnpm dev:mcp  # MCP server only (http://localhost:3334)
```

> New here? [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) is the full onboarding guide — verified boot sequence, how to reach Settings (email verification), and how to connect an MCP client (Claude Desktop, Cursor, VS Code) to your local notes.

### Access Points

| Service   | URL                            |
| --------- | ------------------------------ |
| Frontend  | <http://localhost:4200>        |
| API       | <http://localhost:3333/api/v1> |
| WebSocket | ws://localhost:3333            |
| DB Studio | Run `pnpm db:studio`           |

---

## Running the Project

### Development Mode

#### Full Stack (Recommended)

```bash
# Start all services
pnpm docker:up      # Database + Redis
pnpm dev:all        # API + Frontend
```

#### Frontend Only

```bash
pnpm dev
```

> **Note:** When running frontend-only, collaboration will use WebRTC P2P mode (no backend required).

#### API Only

```bash
pnpm docker:up
pnpm dev:api
```

### Production Build

```bash
# Build all projects
pnpm build      # Frontend → dist/apps/notes
pnpm build:api  # Backend → dist/apps/api

# Run production API
node dist/apps/api/main.js

# Preview production frontend
pnpm preview
```

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:run          # Run tests once (no watch)
pnpm test:coverage     # Run with coverage report
nx test notes          # Test specific project
nx test api            # Test API project
```

---

## Available Scripts

### Development

| Command        | Description                    |
| -------------- | ------------------------------ |
| `pnpm dev`     | Start Notes frontend (Vite)    |
| `pnpm dev:api` | Start API backend (NestJS)     |
| `pnpm dev:all` | Start both apps simultaneously |

### Build & Preview

| Command          | Description                |
| ---------------- | -------------------------- |
| `pnpm build`     | Build Notes for production |
| `pnpm build:api` | Build API for production   |
| `pnpm preview`   | Preview production build   |

### Testing & Quality

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `pnpm test`          | Run all tests in watch mode  |
| `pnpm test:run`      | Run all tests once           |
| `pnpm test:coverage` | Run tests with coverage      |
| `pnpm lint`          | Run ESLint on all projects   |
| `pnpm lint:fix`      | Fix auto-fixable lint issues |
| `pnpm format`        | Format code with Prettier    |
| `pnpm typecheck`     | Run TypeScript type checking |

### Database

| Command            | Description                       |
| ------------------ | --------------------------------- |
| `pnpm db:push`     | Push schema changes (development) |
| `pnpm db:generate` | Generate migration files          |
| `pnpm db:migrate`  | Run database migrations           |
| `pnpm db:studio`   | Open Drizzle Studio GUI           |

### Infrastructure

| Command            | Description                |
| ------------------ | -------------------------- |
| `pnpm docker:up`   | Start PostgreSQL + Redis   |
| `pnpm docker:down` | Stop and remove containers |

### Nx Workspace

| Command               | Description                  |
| --------------------- | ---------------------------- |
| `pnpm graph`          | Visualize dependency graph   |
| `pnpm affected:test`  | Test only affected projects  |
| `pnpm affected:lint`  | Lint only affected projects  |
| `pnpm affected:build` | Build only affected projects |
| `nx serve <project>`  | Serve specific project       |
| `nx build <project>`  | Build specific project       |
| `nx test <project>`   | Test specific project        |

### Makefile (Alternative)

For convenience, all commands are also available via `make`:

```bash
# Show all available commands
make help

# Quick workflows
make setup      # Full setup: install, docker, db
make start      # Start DB + all apps
make fresh      # Clean install from scratch
make ci         # Run full CI pipeline locally

# Common commands
make dev        # Start frontend
make dev-api    # Start backend
make dev-all    # Start everything
make test       # Run tests
make lint       # Lint code
make build      # Build for production
```

Run `make help` to see all available targets with descriptions.

---

## Architecture

### Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Frontend  | React 19, Vite, TanStack Router/Query |
| Backend   | NestJS 11, Drizzle ORM                |
| Database  | PostgreSQL 16, Redis 7                |
| AI        | Claude API (Sonnet 4, Haiku 4.5)      |
| Real-time | Socket.io, Yjs (CRDT)                 |
| Email     | React Email, Resend                   |
| Styling   | Tailwind CSS 4                        |
| i18n      | react-i18next                         |
| Testing   | Vitest, React Testing Library         |
| Monorepo  | Nx 22.3                               |

### Dependency Flow

The workspace follows a unidirectional dependency flow:

```mermaid
graph TD
    subgraph Apps
        Notes[apps/notes]
        API[apps/api]
    end

    subgraph Libs
        ApiClient[libs/api-client]
        DataAccess[libs/data-access]
        Authorization[libs/authorization]
    end

    subgraph SharedPackages
        DesignSystem[packages/design-system]
        Shared[packages/shared]
    end

    Notes --> ApiClient
    Notes --> DataAccess
    Notes --> DesignSystem
    ApiClient --> Shared
    DataAccess --> ApiClient
    DataAccess --> Shared
    DesignSystem --> Shared

    subgraph Packages
        Email[packages/email]
        EmailNestjs[packages/email-nestjs]
        Auth[packages/auth]
        AuthNestjs[packages/auth-nestjs]
    end

    API --> EmailNestjs
    API --> AuthNestjs
    EmailNestjs --> Email
    EmailNestjs --> AuthNestjs
    AuthNestjs --> Auth
```

### Key Design Principles

- **SOLID Principles** - Clean, maintainable architecture
- **Domain-Driven Design** - Clear separation of concerns
- **Type Safety** - Strict TypeScript throughout
- **Composition over Inheritance** - Flexible component design

For detailed architecture documentation, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## Development

### Environment Variables

#### API (`apps/api/.env`)

```env
# Database
DATABASE_URL=postgresql://knowtis:knowtis_dev@localhost:5432/knowtis

# Authentication
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=3333
NODE_ENV=development
FRONTEND_URL=http://localhost:4200
```

#### Notes App (`apps/notes/.env`)

```env
# API Configuration
VITE_API_URL=http://localhost:3333/api/v1
VITE_WS_URL=http://localhost:3333

# Collaboration Mode: 'webrtc' | 'websocket' | 'hybrid'
VITE_COLLABORATION_MODE=websocket
```

### Code Quality

This project uses:

- **ESLint** - Code linting with modern flat config
- **Prettier** - Code formatting
- **Lefthook** - Git hooks (pre-commit, pre-push, commit-msg)

### IDE Setup

Recommended VS Code extensions:

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Nx Console

---

## Documentation

| Document                                          | Description                               |
| ------------------------------------------------- | ----------------------------------------- |
| [API Documentation](./apps/api/README.md)         | Backend API setup, endpoints & deployment |
| [Notes App Documentation](./apps/notes/README.md) | Frontend features & architecture          |
| [Architecture Guide](./docs/ARCHITECTURE.md)      | System design & principles                |
| [Deployment Guide](./docs/DEPLOYMENT.md)          | Railway & Vercel deployment               |
| [API Architecture](./apps/api/ARCHITECTURE.md)    | Backend DDD patterns & module structure   |
| [AI Module](./docs/AI.md)                         | Copilot, model selection, BYOK & AI flows |
| [Email Templates](./packages/email/README.md)     | React Email templates & i18n              |
| [Email NestJS](./packages/email-nestjs/README.md) | NestJS email module (Resend/Console)      |
| [Contributing Guide](./CONTRIBUTING.md)           | How to contribute to the project          |
| [Security Policy](./SECURITY.md)                  | Vulnerability reporting & disclosure      |

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

---

## License

Licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ using Nx, React, and NestJS
</p>
