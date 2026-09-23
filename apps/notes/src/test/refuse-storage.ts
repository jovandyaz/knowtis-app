import { vi } from 'vitest';

const STORAGE_METHODS = ['getItem', 'setItem', 'removeItem'] as const;

export function refuseStorage(): void {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const method of STORAGE_METHODS) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('Storage is unavailable', 'SecurityError');
    });
  }
}
