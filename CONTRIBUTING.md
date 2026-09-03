# Contributing to Knowtis

Thank you for your interest in contributing to Knowtis! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 22.x
- [pnpm](https://pnpm.io/) v10+
- [Docker](https://www.docker.com/) (for PostgreSQL and Redis)

## Getting Started

See [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) for detailed setup instructions, including environment configuration and database setup.

## Project Structure

Knowtis is an [Nx](https://nx.dev/) monorepo: applications live in `apps/` (`api`, `notes`, `backoffice`, `mcp`), frontend libraries in `libs/`, and framework-light shared packages in `packages/`. The layout and dependency rules are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Run `pnpm graph` to visualize the dependency graph.

## Development Workflow

### 1. Fork and Clone

```bash
git clone https://github.com/<your-username>/knowtis-app.git
cd knowtis-app
pnpm run setup   # .env files, dependencies, Docker services, migrations (`setup` alone is a pnpm built-in)
pnpm dev:all     # API :3333, Notes :4200, Backoffice :4400
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

Git hooks (via [Lefthook](https://github.com/evilmartians/lefthook)) run a subset automatically: on commit, ESLint + Prettier on staged files and `nx affected -t typecheck`; on push, `nx affected -t test`.

### 5. Commit Your Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `style:` — Formatting, no code change
- `refactor:` — Code refactoring (no feature change)
- `perf:` — Performance improvement
- `test:` — Adding or updating tests
- `build:` — Build system or dependencies
- `ci:` — CI configuration
- `chore:` — Maintenance tasks
- `revert:` — Reverts a previous commit

The commit message format is enforced by a Git hook.

### 6. Open a Pull Request

- Push your branch and open a PR against `main`, or against the parent branch when stacking PRs (see [CLAUDE.md](CLAUDE.md))
- Fill in the PR template
- Link any related issues
- Ensure all CI checks pass

## Finding Issues to Work On

Look for issues labeled [`good first issue`](https://github.com/jovandyaz/knowtis-app/labels/good%20first%20issue) or [`help wanted`](https://github.com/jovandyaz/knowtis-app/labels/help%20wanted) to get started.

## Reporting Bugs and Requesting Features

Use [GitHub Issues](https://github.com/jovandyaz/knowtis-app/issues) with the provided templates. For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
