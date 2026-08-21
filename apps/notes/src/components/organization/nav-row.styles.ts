/**
 * Shared geometry for every row in the sidebar's organization rail.
 *
 * The three lists stack in one column, so their icons and labels have to land
 * on the same x. Each list owning its own spacing is what let them drift apart.
 */

/** Fixed slot so a 9px dot and a 12px glyph both centre on the same rail. */
export const NAV_ICON_SLOT = 'flex w-3 shrink-0 items-center justify-center';

export const NAV_ROW =
  'flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer';

export const NAV_ROW_ACTIVE = 'bg-muted text-foreground font-medium';

export const NAV_ROW_IDLE =
  'text-muted-foreground hover:bg-primary/5 hover:text-primary';

/** `min-w-0` is load-bearing: without it the label refuses to shrink and the
 * row steals the space from its icon slot instead of ellipsising. */
export const NAV_LABEL = 'min-w-0 flex-1 truncate';

export const NAV_COUNT = 'shrink-0 text-xs text-muted-foreground/60';
