import '@testing-library/jest-dom/vitest';

// jsdom performs no layout, so `offsetParent` is always null and every
// visibility filter keyed on it — such as the dialog's focusable-element
// query — sees an empty list. Approximate it by attachment instead.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    return this.isConnected ? this.parentElement : null;
  },
});

const resizeObservers = new Set<ResizeObserverPolyfill>();

class ResizeObserverPolyfill implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    resizeObservers.delete(this);
  }

  notify() {
    if (this.targets.size > 0) {
      this.callback([], this);
    }
  }
}

globalThis.ResizeObserver = ResizeObserverPolyfill;

/** Runs every connected ResizeObserver callback; wrap the call in `act` when it drives React state. */
export function triggerResizeObservers() {
  for (const observer of resizeObservers) {
    observer.notify();
  }
}
