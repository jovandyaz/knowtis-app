import '@testing-library/jest-dom/vitest';

class ResizeObserverPolyfill implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverPolyfill;
