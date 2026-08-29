import { fireEvent, render, renderHook } from '@testing-library/react';

import { useEscapeDismiss } from './useEscapeDismiss';

function pressEscape() {
  fireEvent.keyDown(document.body, { key: 'Escape' });
}

describe('useEscapeDismiss', () => {
  it('dismisses the active layer', () => {
    const dismiss = vi.fn();
    renderHook(() => useEscapeDismiss(true, dismiss));

    pressEscape();

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('stays out of it while inactive', () => {
    const dismiss = vi.fn();
    renderHook(() => useEscapeDismiss(false, dismiss));

    pressEscape();

    expect(dismiss).not.toHaveBeenCalled();
  });

  it('answers from the layer that opened last, not the one that mounted first', () => {
    const underneath = vi.fn();
    const onTop = vi.fn();

    function Layer({
      active,
      dismiss,
    }: {
      active: boolean;
      dismiss: () => void;
    }) {
      useEscapeDismiss(active, dismiss);
      return null;
    }

    const view = render(
      <>
        <Layer active dismiss={underneath} />
        <Layer active={false} dismiss={onTop} />
      </>
    );
    view.rerender(
      <>
        <Layer active dismiss={underneath} />
        <Layer active dismiss={onTop} />
      </>
    );

    pressEscape();

    expect(onTop).toHaveBeenCalledTimes(1);
    expect(underneath).not.toHaveBeenCalled();
  });

  it('spends one press on one layer, never on two', () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => useEscapeDismiss(true, first));
    renderHook(() => useEscapeDismiss(true, second));

    pressEscape();

    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
  });

  it('leaves an Escape another layer already spent alone', () => {
    const dismiss = vi.fn();
    renderHook(() => useEscapeDismiss(true, dismiss));

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.body.dispatchEvent(event);

    expect(dismiss).not.toHaveBeenCalled();
  });

  it('ignores every key that is not Escape', () => {
    const dismiss = vi.fn();
    renderHook(() => useEscapeDismiss(true, dismiss));

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(dismiss).not.toHaveBeenCalled();
  });

  it('reads the latest dismiss without re-pushing the layer', () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = renderHook(
      ({ dismiss }) => useEscapeDismiss(true, dismiss),
      { initialProps: { dismiss: stale } }
    );

    rerender({ dismiss: fresh });
    pressEscape();

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('stops listening once the last layer goes away', () => {
    const dismiss = vi.fn();
    const { unmount } = renderHook(() => useEscapeDismiss(true, dismiss));
    const remove = vi.spyOn(document, 'removeEventListener');

    unmount();

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    pressEscape();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
