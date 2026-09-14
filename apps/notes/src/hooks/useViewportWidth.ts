import { useSyncExternalStore } from 'react';

export const VIEWPORT_RESIZE_DEBOUNCE_MS = 100;

function readViewportWidth(): number {
  return window.innerWidth;
}

function subscribeToNothing() {
  return () => undefined;
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

export function useViewportWidth(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribeToDebouncedResize : subscribeToNothing,
    readViewportWidth,
    () => 0
  );
}
