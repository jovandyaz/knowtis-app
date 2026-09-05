import type { Size } from './usePanZoom';

const EMPTY_SIZE: Size = { width: 0, height: 0 };
const VIEW_BOX_SEPARATOR = /[\s,]+/;
const VIEW_BOX_WIDTH_INDEX = 2;

function positiveSize(width: number, height: number): Size | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

function sizeFromViewBox(svg: SVGSVGElement): Size | null {
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) {
    return null;
  }
  const parts = viewBox.trim().split(VIEW_BOX_SEPARATOR).map(Number);
  return positiveSize(
    parts[VIEW_BOX_WIDTH_INDEX] ?? NaN,
    parts[VIEW_BOX_WIDTH_INDEX + 1] ?? NaN
  );
}

function sizeFromAttributes(svg: SVGSVGElement): Size | null {
  return positiveSize(
    Number(svg.getAttribute('width')),
    Number(svg.getAttribute('height'))
  );
}

/**
 * The size the diagram was drawn at, ignoring the responsive `width: 100%` and
 * `max-width` mermaid stamps on its output.
 */
export function naturalSvgSize(svg: SVGSVGElement): Size {
  const rect = svg.getBoundingClientRect();
  return (
    sizeFromViewBox(svg) ??
    sizeFromAttributes(svg) ??
    positiveSize(rect.width, rect.height) ??
    EMPTY_SIZE
  );
}
