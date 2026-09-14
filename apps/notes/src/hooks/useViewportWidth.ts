import { useSyncExternalStore } from 'react';

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeToResize,
    () => window.innerWidth,
    () => 0
  );
}
