import { useEffect, useEffectEvent, type RefObject } from 'react';

const ESCAPE_KEY = 'Escape';

/**
 * Hands an Escape pressed in `ref`'s element to `onEscape` and keeps it from
 * dismissing the dialog or sheet around that element. Radix reads Escape in a
 * document capture listener, which runs before the element's own key handlers,
 * so only a window capture listener gets there first. An Escape that closes an
 * IME candidate window is claimed but not passed on.
 */
export function useClaimEscape(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void
): void {
  const escape = useEffectEvent(onEscape);

  useEffect(() => {
    const claim = (event: KeyboardEvent) => {
      if (event.key !== ESCAPE_KEY || event.target !== ref.current) {
        return;
      }
      event.preventDefault();
      if (!event.isComposing) {
        escape();
      }
    };
    window.addEventListener('keydown', claim, { capture: true });
    return () =>
      window.removeEventListener('keydown', claim, { capture: true });
  }, [ref]);
}
