import { vi } from 'vitest';

export function refuseStorageWrites(): void {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage is full', 'QuotaExceededError');
  });
}
