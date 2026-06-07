import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<TArgs | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Flush a pending call on unmount so a trailing auto-save isn't dropped.
  useEffect(
    () => () => {
      if (pendingArgsRef.current) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        callbackRef.current(...pendingArgsRef.current);
      }
    },
    []
  );

  return useCallback(
    (...args: TArgs) => {
      pendingArgsRef.current = args;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        pendingArgsRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}
