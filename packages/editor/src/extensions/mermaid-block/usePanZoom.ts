import { useCallback, useState } from 'react';

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;

const NATURAL_SCALE = 1;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: NATURAL_SCALE, x: 0, y: 0 };

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function scaleAround(current: Transform, factor: number, anchor: Point) {
  const scale = clampScale(current.scale * factor);
  const applied = scale / current.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - current.x) * applied,
    y: anchor.y - (anchor.y - current.y) * applied,
  };
}

function fitTransform(content: Size, viewport: Size): Transform {
  const measured =
    content.width > 0 &&
    content.height > 0 &&
    viewport.width > 0 &&
    viewport.height > 0;
  if (!measured) {
    return IDENTITY;
  }
  const scale = Math.min(
    viewport.width / content.width,
    viewport.height / content.height,
    NATURAL_SCALE
  );
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}

/**
 * Pan/zoom state for a transformed layer whose transform-origin is its top-left
 * corner: `translate(x, y) scale(scale)`.
 */
export function usePanZoom() {
  const [transform, setTransform] = useState<Transform>(IDENTITY);

  const zoomAtPoint = useCallback((factor: number, anchor: Point) => {
    setTransform((current) => scaleAround(current, factor, anchor));
  }, []);

  const panBy = useCallback((delta: Point) => {
    setTransform((current) => ({
      ...current,
      x: current.x + delta.x,
      y: current.y + delta.y,
    }));
  }, []);

  const fit = useCallback((content: Size, viewport: Size) => {
    setTransform(fitTransform(content, viewport));
  }, []);

  return { transform, zoomAtPoint, panBy, fit };
}
