import { useCallback, useRef } from 'react';

/**
 * Radix menus return focus to their trigger on close. After a menu item ran
 * an editor command the caret must stay in the editor, so that default is
 * kept only for dismissals (Escape, outside click) where nothing was chosen.
 */
export function useMenuFocusReturn() {
  const selectedRef = useRef(false);

  const markSelected = useCallback(() => {
    selectedRef.current = true;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    if (selectedRef.current) {
      selectedRef.current = false;
      event.preventDefault();
    }
  }, []);

  return { markSelected, onCloseAutoFocus };
}
