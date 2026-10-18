import '@testing-library/jest-dom/vitest';

import { afterAll, vi } from 'vitest';

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

const NO_LAYOUT_RECT = {
  x: 0,
  y: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
} satisfies DOMRect;

document.elementFromPoint ??= () => null;
Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => NO_LAYOUT_RECT;

// @tiptap/react destroys an unmounted editor from a setTimeout; let it run before
// the file's jsdom environment is torn down, or it throws "window is not defined".
const TIPTAP_SCHEDULED_DESTROY_MS = 1;

afterAll(async () => {
  vi.useRealTimers();
  await new Promise((resolve) =>
    setTimeout(resolve, TIPTAP_SCHEDULED_DESTROY_MS + 1)
  );
});
