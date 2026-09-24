import '@testing-library/jest-dom/vitest';

import { afterAll, vi } from 'vitest';

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

// @tiptap/react destroys an unmounted editor from a setTimeout; let it run before
// the file's jsdom environment is torn down, or it throws "window is not defined".
const TIPTAP_SCHEDULED_DESTROY_MS = 1;

afterAll(async () => {
  vi.useRealTimers();
  await new Promise((resolve) =>
    setTimeout(resolve, TIPTAP_SCHEDULED_DESTROY_MS + 1)
  );
});
