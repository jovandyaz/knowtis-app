# @knowtis/design-system

Shared UI component library and design tokens for the Knowtis frontend. With ~93 consumers it is one of the most-imported workspace packages. Components are generic and reusable — no app-specific business logic.

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

~45 entries under `src/components/` (45 component + story + test files), all re-exported from `src/index.ts`: primitives like `Button`, `Input`, `Textarea`, `Badge`, `Switch`, `Card`; overlays like `Dialog`, `DropdownMenu`, `Tooltip`, `CommandMenu`; state views `LoadingState` / `ErrorState` / `EmptyState`; plus app-shaped pieces such as `ModelSelect`, `SegmentedControl`, `VoiceButton`, `RecordingModal`, `ThemeToggle`, and `PasswordInput`/`PasswordStrength`.

## Design tokens & styles

- **Global styles:** `src/styles.css`
- **Theme constants:** `src/constants/theme.ts` (`THEMES`, `Theme`)
- **Color tokens:** OKLCH colorspace in `tokens/colors.json`, compiled via `style-dictionary.config.mjs` (`nx build design-system` / `nx tokens:build design-system`) into CSS custom properties.
- Reference tokens through CSS custom properties (`bg-(--background)`, `text-(--foreground)`) — never hardcode color or spacing values.
- `cn()` (clsx + tailwind-merge) is exported for merging class names.

## Running unit tests

Run `nx test design-system` to execute the unit tests via [Vitest](https://vitest.dev/).
