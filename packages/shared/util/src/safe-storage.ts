import { logger } from './logger';

type StorageName = 'localStorage' | 'sessionStorage';
type StorageOperation = 'read' | 'write' | 'remove';
type SafeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const LOG_CONTEXT = 'safeStorage';

function createSafeStorage(name: StorageName): SafeStorage {
  const warnedOperations = new Set<StorageOperation>();

  function attempt<T>(
    operation: StorageOperation,
    run: (storage: Storage) => T,
    fallback: T
  ): T {
    try {
      return run(globalThis[name]);
    } catch (error) {
      if (!warnedOperations.has(operation)) {
        warnedOperations.add(operation);
        logger.warn(`${name} ${operation} failed`, {
          error,
          context: LOG_CONTEXT,
        });
      }
      return fallback;
    }
  }

  return {
    getItem: (key) => attempt('read', (storage) => storage.getItem(key), null),
    setItem: (key, value) =>
      attempt('write', (storage) => storage.setItem(key, value), undefined),
    removeItem: (key) =>
      attempt('remove', (storage) => storage.removeItem(key), undefined),
  };
}

export const safeLocalStorage = createSafeStorage('localStorage');
export const safeSessionStorage = createSafeStorage('sessionStorage');
