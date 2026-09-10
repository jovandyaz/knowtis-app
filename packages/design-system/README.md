# @knowtis/design-system

Shared UI component library and design tokens for the Knowtis frontends (`apps/notes`, `apps/backoffice`, `packages/editor`). Components are generic and reusable — no app-specific business logic.

Import via the `@knowtis/design-system` alias (`tsconfig.base.json`):

```ts
import { Button, cn, Dialog, ModelSelect } from '@knowtis/design-system';
```

> **Rule:** prefer design-system components over native HTML elements. Radix UI primitives are allowed when a richer interaction model is needed (Dialog, DropdownMenu, Tooltip, etc.).

## Storybook

Storybook is the canonical component catalog — browse it before building new UI.

```bash
nx storybook design-system          # dev server on http://localhost:6006
nx storybook:build design-system    # static build to storybook-static/
```

Stories are co-located with each component (`Button.stories.tsx` next to `Button.tsx`; `collapsible.stories.tsx` next to `ui/collapsible.tsx`).

## Components

47 components under `src/components/` (107 files in the directory, counting co-located stories, tests and shared helpers), every one re-exported from `src/index.ts`: primitives like `Button`, `Input`, `Textarea`, `Badge`, `Switch`, `Card`; overlays like `Dialog`, `DropdownMenu`, `Tooltip`, `CommandMenuContent` / `CommandMenuGroup` / `CommandMenuItem` / `CommandMenuBack`; state views `LoadingState` / `ErrorState` / `EmptyState`; plus app-shaped pieces such as `ModelMenu`, `ModelSelect`, `SegmentedControl`, `RadioCardGroup`, `VoiceButton`, `RecordingModal`, `ThemeToggle`, and `PasswordInput`/`PasswordStrength`. Also exported: `buttonVariants` and `badgeVariants` (class-variance-authority variants) and the `useEscapeDismiss` hook.

`src/components/ui/` is a second tier holding shadcn/ui primitives vendored verbatim (`collapsible`, `hover-card`). They keep shadcn's kebab-case filenames and `data-slot` attributes so `pnpm ds:add --overwrite <name>` can refresh them in place; hand-written components stay PascalCase in `src/components/`. Both tiers are re-exported from `src/index.ts`, which remains the only public API.

Add a primitive with `pnpm ds:add <name>` from the workspace root. It runs the shadcn CLI in an isolated stage directory (the CLI needs tsconfig `paths`, and adding them here would shadow the inherited `@knowtis/*` aliases), then rewrites the output to this package's conventions: relative `cn` import, `bg-(--token)` form, a `motion-reduce:` guard on every transition, and removal of `tw-animate-css` utilities that this workspace cannot resolve. It refuses to write a file that still fails those checks. Afterwards you must add any reported dependency to the root `package.json`, replace stripped animations with a design-system one, and add the exports to `src/index.ts`.

## Design tokens & styles

- **Global styles:** `src/styles.css`
- **Theme constants:** `src/constants/theme.ts` (`THEMES`, `Theme`)
- **Tokens:** `tokens/colors.json` (OKLCH), `radii.json`, `shadows.json`, `spacing.json`, `typography.json`. `style-dictionary.config.mjs` reads `tokens/**/*.json` and emits `build/css/variables.css`, `build/ts/tokens.ts` and `build/json/tokens.json`. `nx build design-system` regenerates them.
- Reference tokens through CSS custom properties (`bg-(--background)`, `text-(--foreground)`) — never hardcode color or spacing values.
- `cn()` (clsx + tailwind-merge) is exported for merging class names.

## Running unit tests

Run `nx test design-system` to execute the unit tests via [Vitest](https://vitest.dev/).
