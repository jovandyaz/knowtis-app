import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver, so TabsList and recharts would throw on mount without it.
class ResizeObserverPolyfill implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverPolyfill;

// jsdom does no layout and leaves scrollIntoView undefined, so cmdk would throw on every highlight.
Element.prototype.scrollIntoView = () => undefined;
