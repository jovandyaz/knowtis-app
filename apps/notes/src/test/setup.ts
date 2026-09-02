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

// jsdom ships no matchMedia, so any component reading a media query throws.
// Width queries resolve against window.innerWidth (1024 by default): a test
// selects a layout by setting it before rendering, or by changing it and
// dispatching a `resize` event, which notifies every mounted listener.
if (typeof window !== 'undefined' && !window.matchMedia) {
  const matchesWidth = (query: string): boolean => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    return (
      (min ? window.innerWidth >= Number(min[1]) : true) &&
      (max ? window.innerWidth <= Number(max[1]) : true)
    );
  };
  type ChangeListener = (event: MediaQueryListEvent) => void;
  const listeners = new Map<ChangeListener, string>();
  window.addEventListener('resize', () => {
    for (const [listener, query] of listeners) {
      listener({
        matches: matchesWidth(query),
        media: query,
      } as MediaQueryListEvent);
    }
  });
  window.matchMedia = (query: string): MediaQueryList => {
    const subscribe = (listener: ChangeListener) =>
      listeners.set(listener, query);
    const unsubscribe = (listener: ChangeListener) =>
      listeners.delete(listener);
    return {
      get matches() {
        return matchesWidth(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) =>
        subscribe(listener),
      removeEventListener: (_type: string, listener: ChangeListener) =>
        unsubscribe(listener),
      addListener: subscribe,
      removeListener: unsubscribe,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}
