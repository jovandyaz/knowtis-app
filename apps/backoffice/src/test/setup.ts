import '@testing-library/jest-dom/vitest';

// jsdom ships no ResizeObserver, and both TabsList and recharts construct one on mount.
class ResizeObserverPolyfill implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverPolyfill;
