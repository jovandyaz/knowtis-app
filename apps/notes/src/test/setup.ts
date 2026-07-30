import '@testing-library/jest-dom/vitest';

// jsdom ships no ResizeObserver, and @knowtis/design-system's TabsList constructs one on mount.
class ResizeObserverPolyfill implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverPolyfill;
