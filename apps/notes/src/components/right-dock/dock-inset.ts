import { useCallback, type RefObject } from 'react';

/** Live width of the inline copilot dock, published on `:root` for overlays anchored to the workspace. */
export const RIGHT_DOCK_INSET_VAR = '--right-dock-inset';

/**
 * Callback ref for the inline dock: fills `panelRef` and keeps
 * {@link RIGHT_DOCK_INSET_VAR} equal to the dock's rendered width while it is mounted.
 */
export function useDockInsetRef(
  panelRef: RefObject<HTMLElement | null>
): (panel: HTMLElement | null) => (() => void) | undefined {
  return useCallback(
    (panel: HTMLElement | null) => {
      panelRef.current = panel;
      if (!panel) {
        return undefined;
      }
      const root = document.documentElement;
      const publish = () =>
        root.style.setProperty(
          RIGHT_DOCK_INSET_VAR,
          `${panel.getBoundingClientRect().width}px`
        );
      publish();
      const observer = new ResizeObserver(publish);
      observer.observe(panel);
      return () => {
        observer.disconnect();
        root.style.removeProperty(RIGHT_DOCK_INSET_VAR);
        panelRef.current = null;
      };
    },
    [panelRef]
  );
}
