import type { ReactNode } from 'react';

import { useLocation } from '@tanstack/react-router';

import { STUDY_SESSION_PATTERN } from '@/config/routes.config';

export const MOBILE_FAB_SLOT_ID = 'mobile-fab-slot';

/**
 * Bottom padding a page's own bottom row needs so the rail cannot cover it: the rail's
 * tallest button (`FloatingCreateButton`, `size-14`) plus the safe-area inset. The app
 * layout's `pb-20` already matches the rail's offset above the bottom nav, and the rail
 * itself is mobile-only. Complete Tailwind literals so the class scanner emits them.
 */
export const MOBILE_FAB_RAIL_CLEARANCE_CLASS =
  'pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0';

interface MobileFabRailProps {
  children?: ReactNode;
}

/**
 * Single owner of the mobile bottom-right floating action corner. App-level
 * actions render as children; route-level ones portal into MOBILE_FAB_SLOT_ID
 * so no two floating buttons can claim the same coordinates.
 */
export function MobileFabRail({ children }: MobileFabRailProps) {
  const { pathname } = useLocation();

  if (STUDY_SESSION_PATTERN.test(pathname)) {
    return null;
  }

  return (
    <div className="fixed end-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-4 md:hidden">
      {children}
      <div
        id={MOBILE_FAB_SLOT_ID}
        className="flex flex-col items-end gap-4 empty:hidden"
      />
    </div>
  );
}
