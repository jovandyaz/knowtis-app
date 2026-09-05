import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { Point } from './usePanZoom';

const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const LINE_HEIGHT_PX = 16;
const PINCH_POINTER_COUNT = 2;

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// capture keeps a drag alive past the surface edge, but it throws for a pointer
// the browser no longer holds active, which would abandon the gesture mid-press
function tryCapturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    return;
  }
}

function tryReleasePointer(element: Element, pointerId: number): void {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch {
    return;
  }
}

interface DragZoomGestures {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface DragZoomActions {
  panBy: (delta: Point) => void;
  zoomAtPoint: (factor: number, anchor: Point) => void;
}

/**
 * Translates drag, pinch and wheel input over `surface` into pan and zoom.
 * Anchors are reported relative to the surface, so the caller's transform
 * origin must be the surface's top-left corner.
 */
export function useDragZoomGestures(
  surface: HTMLElement | null,
  { panBy, zoomAtPoint }: DragZoomActions
): DragZoomGestures {
  const activePointers = useRef(new Map<number, Point>());
  const pinchDistance = useRef<number | null>(null);

  const anchorIn = useCallback(
    (point: Point): Point => {
      const rect = surface?.getBoundingClientRect();
      return rect ? { x: point.x - rect.left, y: point.y - rect.top } : point;
    },
    [surface]
  );

  useEffect(() => {
    if (!surface) {
      return;
    }
    // React attaches wheel listeners passively, so preventDefault only lands
    // from a native non-passive listener
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * LINE_HEIGHT_PX
          : event.deltaY;
      zoomAtPoint(
        Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY),
        anchorIn({ x: event.clientX, y: event.clientY })
      );
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [surface, zoomAtPoint, anchorIn]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    tryCapturePointer(event.currentTarget, event.pointerId);
    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointers = activePointers.current;
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      const current = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, current);

      if (pointers.size < PINCH_POINTER_COUNT) {
        panBy({ x: current.x - previous.x, y: current.y - previous.y });
        return;
      }

      const [first, second] = Array.from(pointers.values());
      if (!first || !second) {
        return;
      }
      const spread = distanceBetween(first, second);
      const lastSpread = pinchDistance.current;
      pinchDistance.current = spread;
      if (lastSpread && spread > 0) {
        zoomAtPoint(spread / lastSpread, anchorIn(midpointOf(first, second)));
      }
    },
    [panBy, zoomAtPoint, anchorIn]
  );

  const onPointerRelease = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      tryReleasePointer(event.currentTarget, event.pointerId);
      activePointers.current.delete(event.pointerId);
      if (activePointers.current.size < PINCH_POINTER_COUNT) {
        pinchDistance.current = null;
      }
    },
    []
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerRelease,
    onPointerCancel: onPointerRelease,
  };
}
