import { logger } from './logger';

type StorageOperation = 'read' | 'write' | 'remove';

const LOG_CONTEXT = 'safeLocalStorage';

const warnedOperations = new Set<StorageOperation>();

function attempt<T>(operation: StorageOperation, run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    if (!warnedOperations.has(operation)) {
      warnedOperations.add(operation);
      logger.warn(`localStorage ${operation} failed`, {
        error,
        context: LOG_CONTEXT,
      });
    }
    return fallback;
  }
}

export const safeLocalStorage: Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
> = {
  getItem: (key) => attempt('read', () => localStorage.getItem(key), null),
  setItem: (key, value) =>
    attempt('write', () => localStorage.setItem(key, value), undefined),
  removeItem: (key) =>
    attempt('remove', () => localStorage.removeItem(key), undefined),
};
