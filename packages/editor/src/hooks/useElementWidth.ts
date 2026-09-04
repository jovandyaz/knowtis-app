import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Tracks an element's border-box width. `null` until the first measurement,
 * which happens before paint so consumers never flash an unmeasured layout.
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>
): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(
          entry.borderBoxSize?.[0]?.inlineSize ??
            entry.target.getBoundingClientRect().width
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
