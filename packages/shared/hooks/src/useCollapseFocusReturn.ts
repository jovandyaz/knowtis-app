import { useCallback, type RefObject } from 'react';

/**
 * Hands focus back to a panel's toggle before the panel collapses.
 *
 * Call the returned function while the panel is still mounted: its own controls
 * unmount with it, so focus would otherwise fall to `<body>`. Focus only moves
 * when the panel actually holds it, and a host without the toggle is a no-op.
 *
 * @param panelRef - Ref to the panel element that is about to collapse
 * @param toggleId - `id` of the control that reopens the panel
 */
export function useCollapseFocusReturn(
  panelRef: RefObject<HTMLElement | null>,
  toggleId: string
): () => void {
  return useCallback(() => {
    if (!panelRef.current?.contains(document.activeElement)) {
      return;
    }
    document.getElementById(toggleId)?.focus({ preventScroll: true });
  }, [panelRef, toggleId]);
}
