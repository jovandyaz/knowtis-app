import { useEffect, useRef } from 'react';

/**
 * Returns a ref that always holds the latest value.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
