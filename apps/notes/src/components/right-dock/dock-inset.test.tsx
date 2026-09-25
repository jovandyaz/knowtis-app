import { useRef } from 'react';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RIGHT_DOCK_INSET_VAR, useDockInsetRef } from './dock-inset';

let resize: (() => void) | undefined;

class CapturingResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resize = undefined;
  }
}

function Dock({ width }: { width: { current: number } }) {
  const panelRef = useRef<HTMLElement>(null);
  const ref = useDockInsetRef(panelRef);
  return (
    <aside
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () =>
            ({ width: width.current }) as DOMRect;
        }
        return ref(node);
      }}
    />
  );
}

const inset = () =>
  document.documentElement.style.getPropertyValue(RIGHT_DOCK_INSET_VAR);

describe('useDockInsetRef', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty(RIGHT_DOCK_INSET_VAR);
  });

  it('publishes the dock width while it is mounted and clears it on unmount', () => {
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
    const width = { current: 360 };
    const { unmount } = render(<Dock width={width} />);

    expect(inset()).toBe('360px');

    width.current = 420;
    resize?.();
    expect(inset()).toBe('420px');

    unmount();
    expect(inset()).toBe('');
    expect(resize).toBeUndefined();
  });
});
