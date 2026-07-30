const SCROLL_EDGE_TOLERANCE_PX = 1;

export const TABS_OVERFLOW = {
  NONE: 'none',
  LEFT: 'left',
  RIGHT: 'right',
  BOTH: 'both',
} as const;

export type TabsOverflow = (typeof TABS_OVERFLOW)[keyof typeof TABS_OVERFLOW];

export const TABS_OVERFLOW_MASK_CLASS: Record<TabsOverflow, string> = {
  [TABS_OVERFLOW.NONE]: '',
  [TABS_OVERFLOW.LEFT]: 'mask-l-from-(--tabs-fade-start)',
  [TABS_OVERFLOW.RIGHT]: 'mask-r-from-(--tabs-fade-start)',
  [TABS_OVERFLOW.BOTH]: 'mask-x-from-(--tabs-fade-start)',
};

// The `!` keeps this reset winning if the mask ever moves back to a `data-[overflow=…]:` variant.
export const TABS_FOCUS_MASK_RESET_CLASS = 'has-[:focus-visible]:mask-none!';

/** Returns the physical edges the element can still be scrolled towards. */
export function readOverflow(element: Element): TabsOverflow {
  const canScrollLeft = element.scrollLeft > SCROLL_EDGE_TOLERANCE_PX;
  const canScrollRight =
    element.scrollWidth - element.clientWidth - element.scrollLeft >
    SCROLL_EDGE_TOLERANCE_PX;

  if (canScrollLeft && canScrollRight) {
    return TABS_OVERFLOW.BOTH;
  }
  if (canScrollLeft) {
    return TABS_OVERFLOW.LEFT;
  }
  if (canScrollRight) {
    return TABS_OVERFLOW.RIGHT;
  }
  return TABS_OVERFLOW.NONE;
}
