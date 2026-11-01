---
paths:
  - 'packages/design-system/**'
---

# Design system

- Check [shadcn/ui](https://ui.shadcn.com/docs/components) before writing a primitive by hand, and vendor it with `pnpm ds:add <name>`. Hand-write one only when no primitive covers the behavior or adopting it would mean disabling its core feature, and say which in the PR.
- Under `src/components/ui/`, hand-edit only the normalizations `pnpm ds:add` reports; `--overwrite` discards anything else. To add behavior, wrap the primitive in a PascalCase component.
- Import Radix from the unified `radix-ui` package, never `@radix-ui/react-*`: two import surfaces create two `DismissableLayer` registries and break nested overlays.
- Learn tones split fill from text: `learn-*` for fills and rings, `learn-*-text` for text, because the fill shades fail WCAG AA as text.
- CSS motion uses `duration-(--motion-duration-fast|base|slow)` and `ease-standard|enter|exit` plus a `motion-reduce:` escape hatch. `motion/react` takes every transition from `useMotionPreset()`. Never branch on `prefers-reduced-motion` by hand.
- Interactive primitives declare their cursor in their base classes (`cursor-pointer`, or what the gesture implies): Tailwind v4 leaves buttons at `cursor: default`.
