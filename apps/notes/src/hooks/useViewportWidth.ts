import { useSyncExternalStore } from 'react';

export const VIEWPORT_RESIZE_DEBOUNCE_MS = 100;

function readViewportWidth(): number {
  return window.innerWidth;
}

function subscribeToDebouncedResize(onChange: () => void) {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(pending);
    pending = setTimeout(onChange, VIEWPORT_RESIZE_DEBOUNCE_MS);
  };

  window.addEventListener('resize', onResize);
  return () => {
    clearTimeout(pending);
    window.removeEventListener('resize', onResize);
  };
}

export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeToDebouncedResize,
    readViewportWidth,
    () => 0
  );
}
