import { useRef } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useClaimEscape } from './useClaimEscape';

function Field({ onEscape }: { onEscape: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useClaimEscape(ref, onEscape);
  return (
    <>
      <input ref={ref} aria-label="field" />
      <input aria-label="other" />
    </>
  );
}

describe('useClaimEscape', () => {
  it('hands Escape to its field before anything outside can dismiss on it', () => {
    const onEscape = vi.fn();
    const documentSaw = vi.fn();
    const listener = (event: KeyboardEvent) =>
      documentSaw(event.defaultPrevented);
    document.addEventListener('keydown', listener, { capture: true });
    render(<Field onEscape={onEscape} />);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'field' }), {
      key: 'Escape',
    });
    document.removeEventListener('keydown', listener, { capture: true });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(documentSaw.mock.calls).toEqual([[true]]);
  });

  it('leaves an Escape pressed anywhere else alone', () => {
    const onEscape = vi.fn();
    render(<Field onEscape={onEscape} />);

    const pressed = fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'other' }),
      { key: 'Escape' }
    );

    expect(onEscape).not.toHaveBeenCalled();
    expect(pressed).toBe(true);
  });

  it('claims but does not act on an Escape that closes an IME window', () => {
    const onEscape = vi.fn();
    render(<Field onEscape={onEscape} />);

    const pressed = fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'field' }),
      { key: 'Escape', isComposing: true }
    );

    expect(onEscape).not.toHaveBeenCalled();
    expect(pressed).toBe(false);
  });
});
