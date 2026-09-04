import { useLayoutEffect, type RefObject } from 'react';

/**
 * Sizes a textarea to its content on every value change. The element's own
 * `max-height` still caps it; past that point the content scrolls inside.
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    // Collapse first so scrollHeight reflects the content, not the old box.
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [ref, value]);
}
