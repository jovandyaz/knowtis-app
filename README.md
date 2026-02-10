# Knowtis

<p align="center">
  <img src="https://img.shields.io/badge/Nx-22.3-blue?style=for-the-badge&logo=nx" alt="Nx" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
</p>

<p align="center">
  <strong>A modern, real-time collaborative notes platform built as a full-stack monorepo.</strong>
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

**Knowtis** is a collaborative workspace platform that enables real-time note-taking with features like:

- 🔐 **Secure Authentication** - JWT-based auth with refresh tokens
- 📝 **Rich Text Editing** - Powered by Tiptap/ProseMirror
- 🔄 **Real-time Collaboration** - CRDT-based sync using Yjs
- 🌐 **Offline Support** - IndexedDB persistence for offline access
- 👥 **Live Presence** - See collaborators editing in real-time
- 🎨 **Modern UI** - Tailwind CSS 4 with dark mode support

---

## Quick Start

### Prerequisites

| Requirement | Version |
| ----------- | ------- |
| Node.js     | ≥ 22.x  |
| pnpm        | ≥ 10.x  |
| Docker      | ≥ 20.x  |

### 1. Clone and Install

```bash
git clone git@github.com:jovandyaz/knowtis_app.git
cd knowtis
pnpm install
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis containers
pnpm docker:up
```

### 3. Configure Environment

```bash
# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/notes/.env.example apps/notes/.env
```

### 4. Initialize Database

```bash
# Push database schema
pnpm db:push
```

### 5. Start Development Servers

```bash
# Option A: Start both apps simultaneously
pnpm dev:all

# Option B: Start individually
pnpm dev      # Frontend only (http://localhost:4200)
pnpm dev:api  # Backend only (http://localhost:3333)
```

### Access Points

| Service   | URL                          |
| --------- | ---------------------------- |
| Frontend  | http://localhost:4200        |
| API       | http://localhost:3333/api/v1 |
| WebSocket | ws://localhost:3333          |
| DB Studio | Run `pnpm db:studio`         |

---

## Project Structure

```
knowtis/
├── apps/                          # Deployable applications
│   ├── api/                       # NestJS backend API
│   │   ├── src/
│   │   │   ├── modules/           # Feature modules
│   │   │   │   ├── auth/          # Authentication (JWT)
│   │   │   │   ├── notes/         # Notes CRUD
│   │   │   │   ├── users/         # User management
│   │   │   │   └── collaboration/ # WebSocket + Yjs
│   │   │   ├── database/          # Drizzle ORM + schemas
│   │   │   └── core/              # Filters, interceptors
│   │   └── README.md              # API documentation
│   │
│   └── notes/                     # React frontend app
│       ├── src/
│       │   ├── components/        # Feature components
│       │   ├── pages/             # Page components
│       │   ├── routes/            # TanStack Router routes
│       │   ├── providers/         # Context providers (Yjs, Theme)
│       │   ├── hooks/             # App-specific hooks
│       │   └── lib/               # Utilities
│       └── README.md              # Frontend documentation
│
├── libs/                          # Shared libraries
│   ├── api-client/                # HTTP/WebSocket client
│   ├── auth/                      # Auth hooks, store & API client
│   ├── data-access/               # Domain logic & state
│   │   └── notes/                 # Notes hooks & store
│   ├── design-system/             # UI components & tokens
│   └── shared/                    # Utilities & types
│       ├── hooks/                 # Generic React hooks
│       ├── types/                 # Shared TypeScript types
│       └── util/                  # Utility functions
│
├── docs/                          # Additional documentation
│   └── ARCHITECTURE.md            # Architecture deep-dive
│
├── docker-compose.yml             # Local infrastructure
├── nx.json                        # Nx workspace config
├── package.json                   # Root package.json
└── pnpm-workspace.yaml            # pnpm workspaces config
```

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
| Real-time | Socket.io, Yjs (CRDT)                 |
| Styling   | Tailwind CSS 4                        |
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
        DesignSystem[libs/design-system]
        Shared[libs/shared]
    end

    Notes --> ApiClient
    Notes --> DataAccess
    Notes --> DesignSystem
    ApiClient --> Shared
    DataAccess --> ApiClient
    DataAccess --> Shared
    DesignSystem --> Shared
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

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add login functionality
fix: resolve navigation bug
docs: update README
refactor: simplify auth flow
test: add unit tests for notes store
chore: update dependencies
```

---

## License

This project is proprietary software. All rights reserved.

---

<p align="center">
  Built with ❤️ using Nx, React, and NestJS
</p>
