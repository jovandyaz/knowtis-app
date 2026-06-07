import { useCallback, useEffect, useRef } from 'react';

import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * Debounced auto-save that accumulates partial updates and fires once with the
 * merged payload
 */
export function useDebouncedMerge<T extends object>(
  callback: (merged: Partial<T>) => void,
  delay: number
): (partial: Partial<T>) => void {
  const mergedRef = useRef<Partial<T>>({});
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const flushMerged = useDebouncedCallback(() => {
    const merged = mergedRef.current;
    mergedRef.current = {};
    if (Object.keys(merged).length > 0) {
      callbackRef.current(merged);
    }
  }, delay);

  return useCallback(
    (partial: Partial<T>) => {
      mergedRef.current = { ...mergedRef.current, ...partial };
      flushMerged();
    },
    [flushMerged]
  );
}
