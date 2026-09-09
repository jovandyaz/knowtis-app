/**
 * Height half of the 44px floor, for controls that already fill their container's
 * width so a minimum width would be inert.
 */
export const TOUCH_TARGET_HEIGHT_CLASS = 'pointer-coarse:min-h-11';

/**
 * 44x44px hit area (WCAG 2.5.5) in both dimensions, gated on a coarse pointer exactly
 * like the `Button` base so one policy governs every control: touch gets the floor, a
 * mouse keeps the design system's natural density. Complete Tailwind literals so the
 * class scanner emits both utilities.
 */
export const TOUCH_TARGET_CLASS = `${TOUCH_TARGET_HEIGHT_CLASS} pointer-coarse:min-w-11`;
