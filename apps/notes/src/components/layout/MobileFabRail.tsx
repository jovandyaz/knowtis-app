import type { ReactNode } from 'react';

export const MOBILE_FAB_SLOT_ID = 'mobile-fab-slot';

interface MobileFabRailProps {
  children?: ReactNode;
}

/**
 * Single owner of the mobile bottom-right floating action corner. App-level
 * actions render as children; route-level ones portal into MOBILE_FAB_SLOT_ID
 * so no two floating buttons can claim the same coordinates.
 */
export function MobileFabRail({ children }: MobileFabRailProps) {
  return (
    <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-4 md:hidden">
      {children}
      <div
        id={MOBILE_FAB_SLOT_ID}
        className="flex flex-col items-center gap-4 empty:hidden"
      />
    </div>
  );
}
