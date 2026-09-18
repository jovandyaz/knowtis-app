import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCollapseFocusReturn } from './useCollapseFocusReturn';

const TOGGLE_ID = 'panel-toggle';

function mountPanelAndToggle() {
  const panel = document.createElement('div');
  const inside = document.createElement('button');
  panel.appendChild(inside);

  const toggle = document.createElement('button');
  toggle.id = TOGGLE_ID;

  const outside = document.createElement('button');

  document.body.append(panel, toggle, outside);
  return { panel, inside, toggle, outside };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useCollapseFocusReturn', () => {
  it('moves focus to the toggle when the panel holds it', () => {
    const { panel, inside, toggle } = mountPanelAndToggle();
    inside.focus();
    const { result } = renderHook(() =>
      useCollapseFocusReturn({ current: panel }, TOGGLE_ID)
    );

    result.current();

    expect(document.activeElement).toBe(toggle);
  });

  it('focuses the toggle without scrolling it into view', () => {
    const { panel, inside, toggle } = mountPanelAndToggle();
    const focus = vi.spyOn(toggle, 'focus');
    inside.focus();
    const { result } = renderHook(() =>
      useCollapseFocusReturn({ current: panel }, TOGGLE_ID)
    );

    result.current();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('leaves focus alone when the panel does not hold it', () => {
    const { panel, outside } = mountPanelAndToggle();
    outside.focus();
    const { result } = renderHook(() =>
      useCollapseFocusReturn({ current: panel }, TOGGLE_ID)
    );

    result.current();

    expect(document.activeElement).toBe(outside);
  });

  it('leaves focus alone on a host that offers no toggle', () => {
    const { panel, inside, toggle } = mountPanelAndToggle();
    toggle.remove();
    inside.focus();
    const { result } = renderHook(() =>
      useCollapseFocusReturn({ current: panel }, TOGGLE_ID)
    );

    expect(() => result.current()).not.toThrow();
    expect(document.activeElement).toBe(inside);
  });

  it('no-ops before the panel is mounted', () => {
    const { outside } = mountPanelAndToggle();
    outside.focus();
    const { result } = renderHook(() =>
      useCollapseFocusReturn({ current: null }, TOGGLE_ID)
    );

    result.current();

    expect(document.activeElement).toBe(outside);
  });

  it('keeps the same callback across renders', () => {
    const { panel } = mountPanelAndToggle();
    const panelRef = { current: panel };
    const { result, rerender } = renderHook(() =>
      useCollapseFocusReturn(panelRef, TOGGLE_ID)
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
