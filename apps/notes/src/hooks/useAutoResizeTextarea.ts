import { useEffect, useLayoutEffect, type RefObject } from 'react';

function sizeToContent(element: HTMLTextAreaElement): void {
  if (element.value === '') {
    element.style.height = '';
    return;
  }
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

/**
 * Sizes a textarea to its content on every value and width change; `max-height`
 * still caps it. The observer binds once, so the ref must be set from mount.
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
    sizeToContent(element);
  }, [ref, value]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    // Content wraps differently at every width, so a measure goes stale only
    // once the width moves — and our own height writes must not re-trigger one.
    let lastWidth: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width === lastWidth) {
        return;
      }
      lastWidth = width;
      sizeToContent(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
