import { useCallback, useState } from 'react';

function readStorage(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  } catch (error) {
    console.warn('[useCollapsible] Failed to read from localStorage', error);
    return defaultValue;
  }
}

function writeStorage(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.warn('[useCollapsible] Failed to write to localStorage', error);
  }
}

export function useCollapsible(storageKey: string, defaultCollapsed = false) {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    readStorage(storageKey, defaultCollapsed)
  );

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      writeStorage(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return { isCollapsed, toggle } as const;
}
