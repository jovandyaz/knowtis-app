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

Stories are co-located with each component (`Button.stories.tsx` next to `Button.tsx`).

## Components

35 components under `src/components/` (63 files in the directory, counting co-located stories and tests), every one re-exported from `src/index.ts`: primitives like `Button`, `Input`, `Textarea`, `Badge`, `Switch`, `Card`; overlays like `Dialog`, `DropdownMenu`, `Tooltip`, `CommandMenuContent` / `CommandMenuGroup` / `CommandMenuItem` / `CommandMenuBack`; state views `LoadingState` / `ErrorState` / `EmptyState`; plus app-shaped pieces such as `ModelMenu`, `ModelSelect`, `SegmentedControl`, `RadioCardGroup`, `VoiceButton`, `RecordingModal`, `ThemeToggle`, and `PasswordInput`/`PasswordStrength`. Also exported: `buttonVariants` and `badgeVariants` (class-variance-authority variants) and the `useEscapeDismiss` hook.

## Design tokens & styles

- **Global styles:** `src/styles.css`
- **Theme constants:** `src/constants/theme.ts` (`THEMES`, `Theme`)
- **Tokens:** `tokens/colors.json` (OKLCH), `radii.json`, `shadows.json`, `spacing.json`, `typography.json`. `style-dictionary.config.mjs` reads `tokens/**/*.json` and emits `build/css/variables.css`, `build/ts/tokens.ts` and `build/json/tokens.json`. `nx build design-system` and `nx tokens:build design-system` run the same command.
- Reference tokens through CSS custom properties (`bg-(--background)`, `text-(--foreground)`) — never hardcode color or spacing values.
- `cn()` (clsx + tailwind-merge) is exported for merging class names.

## Running unit tests

Run `nx test design-system` to execute the unit tests via [Vitest](https://vitest.dev/).
