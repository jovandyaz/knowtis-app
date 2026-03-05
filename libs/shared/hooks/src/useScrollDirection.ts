import { useEffect, useRef, useState } from 'react';

type ScrollDirection = 'up' | 'down' | null;

const SCROLL_THRESHOLD = 10;

export function useScrollDirection(): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    const handleScroll = () => {
      if (ticking.current) {
        return;
      }

      ticking.current = true;
      requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const diff = currentScrollY - lastScrollY.current;

        if (Math.abs(diff) > SCROLL_THRESHOLD) {
          setDirection(diff > 0 ? 'down' : 'up');
          lastScrollY.current = currentScrollY;
        }

        ticking.current = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return direction;
}
