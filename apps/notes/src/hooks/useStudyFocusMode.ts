import { useEffect, useRef } from 'react';

import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';

export function useStudyFocusMode() {
  const wasDockOpen = useRef(false);
  const wasSidebarCollapsed = useRef(false);

  useEffect(() => {
    wasDockOpen.current = useRightDockStore.getState().isOpen;
    wasSidebarCollapsed.current = useSidebarStore.getState().collapsed;
    useRightDockStore.getState().close();
    useSidebarStore.getState().setCollapsed(true);

    return () => {
      if (wasDockOpen.current) {
        useRightDockStore.getState().open();
      }
      if (useSidebarStore.getState().collapsed) {
        useSidebarStore.getState().setCollapsed(wasSidebarCollapsed.current);
      }
    };
  }, []);
}
