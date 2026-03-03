import { createCrossTabSync } from '../sync/cross-tab-sync';

describe('createCrossTabSync', () => {
  const storageKey = 'test-auth';

  function fireStorageEvent(key: string | null, newValue: string | null): void {
    const event = new StorageEvent('storage', { key, newValue });
    window.dispatchEvent(event);
  }

  it('should call onLogoutDetected when storage key is removed', () => {
    const onLogoutDetected = vi.fn();
    const cleanup = createCrossTabSync({ storageKey, onLogoutDetected });

    fireStorageEvent(storageKey, null);

    expect(onLogoutDetected).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('should call onLogoutDetected when isAuthenticated becomes false', () => {
    const onLogoutDetected = vi.fn();
    const cleanup = createCrossTabSync({ storageKey, onLogoutDetected });

    const newValue = JSON.stringify({
      state: { user: null, isAuthenticated: false },
    });
    fireStorageEvent(storageKey, newValue);

    expect(onLogoutDetected).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('should not trigger for unrelated storage keys', () => {
    const onLogoutDetected = vi.fn();
    const cleanup = createCrossTabSync({ storageKey, onLogoutDetected });

    fireStorageEvent('other-key', null);

    expect(onLogoutDetected).not.toHaveBeenCalled();
    cleanup();
  });

  it('should not trigger when isAuthenticated is true', () => {
    const onLogoutDetected = vi.fn();
    const cleanup = createCrossTabSync({ storageKey, onLogoutDetected });

    const newValue = JSON.stringify({
      state: { user: { id: '1' }, isAuthenticated: true },
    });
    fireStorageEvent(storageKey, newValue);

    expect(onLogoutDetected).not.toHaveBeenCalled();
    cleanup();
  });

  it('should not trigger on invalid JSON', () => {
    const onLogoutDetected = vi.fn();
    const cleanup = createCrossTabSync({ storageKey, onLogoutDetected });

    fireStorageEvent(storageKey, 'not-valid-json');

    expect(onLogoutDetected).not.toHaveBeenCalled();
    cleanup();
  });

  it('should stop listening after cleanup', () => {
    const onLogoutDetected = vi.fn();
    const cleanup = createCrossTabSync({ storageKey, onLogoutDetected });

    cleanup();
    fireStorageEvent(storageKey, null);

    expect(onLogoutDetected).not.toHaveBeenCalled();
  });
});
