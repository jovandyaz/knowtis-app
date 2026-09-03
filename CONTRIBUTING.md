# Contributing to Knowtis

Thank you for your interest in contributing to Knowtis! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v10+
- [Docker](https://www.docker.com/) (for PostgreSQL and Redis)

## Getting Started

See the [README](README.md) for detailed setup instructions, including environment configuration and database setup.

## Project Structure

Knowtis is an [Nx](https://nx.dev/) monorepo:

```
apps/
├── api/       # NestJS backend
├── mcp/       # MCP server for AI assistants
└── notes/     # React frontend

libs/          # Shared libraries (UI, data-access, utilities)
```

Run `pnpm graph` to visualize the dependency graph.

## Development Workflow

### 1. Fork and Clone

```bash
git clone https://github.com/<your-username>/knowtis-app.git
cd knowtis-app
pnpm install
```

### 2. Create a Branch

```bash
git checkout -b feat/your-feature
```

### 3. Make Your Changes

- Follow the existing code style and conventions
- Write tests for new functionality
- Keep changes focused — one feature or fix per PR

### 4. Verify Your Changes

```bash
pnpm lint          # Lint all projects
pnpm typecheck     # TypeScript type checking
pnpm test:run      # Run tests once
```

All three checks are enforced by Git hooks (via [Lefthook](https://github.com/evilmartians/lefthook)), so they will run automatically on commit and push.

### 5. Commit Your Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code refactoring (no feature change)
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

The commit message format is enforced by a Git hook.

### 6. Open a Pull Request

- Push your branch and open a PR against `main`
- Fill in the PR template
- Link any related issues
- Ensure all CI checks pass

## Finding Issues to Work On

Look for issues labeled [`good first issue`](https://github.com/jovandyaz/knowtis-app/labels/good%20first%20issue) or [`help wanted`](https://github.com/jovandyaz/knowtis-app/labels/help%20wanted) to get started.

## Reporting Bugs and Requesting Features

Use [GitHub Issues](https://github.com/jovandyaz/knowtis-app/issues) with the provided templates. For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
