import { useEffect, useRef } from 'react';

interface EscapeLayer {
  dismiss: () => void;
}

// One listener answers for the whole stack. Per-layer listeners race: order is
// decided by which registered first, not by which is on top, so an Escape can
// dismiss a layer underneath the one the user is looking at — or be spent twice.
const escapeLayerStack: EscapeLayer[] = [];

function dismissTopmostLayer(event: globalThis.KeyboardEvent) {
  if (event.key !== 'Escape') {
    return;
  }
  // Radix dismissable layers (menus, popovers, its own dialog) listen in the
  // capture phase and preventDefault the Escape they consume, so this bubble
  // listener would otherwise spend the same press a second time.
  if (event.defaultPrevented) {
    return;
  }
  const topmost = escapeLayerStack[escapeLayerStack.length - 1];
  if (!topmost) {
    return;
  }
  event.preventDefault();
  topmost.dismiss();
}

function pushEscapeLayer(layer: EscapeLayer) {
  escapeLayerStack.push(layer);
  if (escapeLayerStack.length === 1) {
    document.addEventListener('keydown', dismissTopmostLayer);
  }
}

function removeEscapeLayer(layer: EscapeLayer) {
  const index = escapeLayerStack.indexOf(layer);
  if (index !== -1) {
    escapeLayerStack.splice(index, 1);
  }
  if (escapeLayerStack.length === 0) {
    document.removeEventListener('keydown', dismissTopmostLayer);
  }
}

/**
 * Joins the shared Escape stack while `active`, so one press dismisses only the
 * layer on top. Any overlay that would otherwise add its own `document`
 * listener belongs here — a second listener reintroduces the race this closes.
 */
export function useEscapeDismiss(active: boolean, dismiss: () => void): void {
  const layer = useRef<EscapeLayer>({ dismiss: () => undefined });

  useEffect(() => {
    layer.current.dismiss = dismiss;
  }, [dismiss]);

  // Keyed on `active` alone: an unstable `dismiss` re-runs the effect on every
  // parent render, which would re-push this layer above one opened after it.
  useEffect(() => {
    if (!active) {
      return;
    }
    const current = layer.current;
    pushEscapeLayer(current);
    return () => removeEscapeLayer(current);
  }, [active]);
}
