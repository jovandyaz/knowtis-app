import '@testing-library/jest-dom/vitest';

// jsdom ships no ResizeObserver, and @knowtis/design-system's TabsList constructs one on mount.
class ResizeObserverPolyfill implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverPolyfill;

class IntersectionObserverPolyfill implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = IntersectionObserverPolyfill;
