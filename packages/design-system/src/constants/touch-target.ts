/**
 * 44px hit area (WCAG 2.5.5), gated on a coarse pointer exactly like the `Button`
 * base so one policy governs every control: touch gets the floor, a mouse keeps the
 * design system's natural density. A complete Tailwind literal so the scanner emits it.
 */
export const TOUCH_TARGET_CLASS = 'pointer-coarse:min-h-11';
