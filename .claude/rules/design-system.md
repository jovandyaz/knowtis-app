---
paths:
  - 'libs/design-system/**'
---

# Design System Rules

## Component Structure

- Use `forwardRef` for all components that render a DOM element.
- Define variants with `class-variance-authority` (CVA):
  ```typescript
  const buttonVariants = cva('base-classes', {
    variants: {
      variant: { default: '...', destructive: '...' },
      size: { default: '...', sm: '...' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  });
  ```
- Merge classNames with `cn()` utility (clsx + tailwind-merge): `cn(buttonVariants({ variant, size }), className)`.
- Export both the component and its variants type: `export { Button, buttonVariants }`.

## Design Tokens

- Color system uses OKLCH colorspace defined in `tokens/colors.json`.
- Semantic tokens map to CSS custom properties: `bg-(--background)`, `text-(--foreground)`, `border-(--border)`.
- Never hardcode color values (hex, rgb, oklch) in components — always reference tokens via CSS custom properties.
- Never hardcode spacing values — use Tailwind spacing scale (`p-4`, `gap-2`, `mt-6`).

## Accessibility (a11y)

- Every interactive element must have an accessible name (visible label, `aria-label`, or `aria-labelledby`).
- Keyboard navigation: all interactive elements must be focusable and operable via keyboard (Enter, Space, Escape, Arrow keys as appropriate).
- Focus management: modals and dialogs must trap focus and restore it on close.
- Use semantic HTML elements: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<aside>` for landmarks.
- Color contrast: ensure text meets WCAG 2.1 AA minimum contrast ratio (4.5:1 for normal text, 3:1 for large text).

## Component Guidelines

- Components must be generic and reusable — no app-specific business logic.
- Props API should follow composition patterns (Radix-style): compound components with `Root`, `Trigger`, `Content` subcomponents where applicable.
- Support `className` prop for consumer customization (merged via `cn()`).
- Handle all interactive states: default, hover, focus, active, disabled.

## Storybook

- Story files are colocated with components: `Button.stories.tsx` next to `Button.tsx`.
- Each component must have at least one story showing default state and variant combinations.
- Use `args` and `argTypes` for interactive controls.
