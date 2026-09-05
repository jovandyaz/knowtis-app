import { describe, expect, it } from 'vitest';

import { naturalSvgSize } from './naturalSvgSize';

function svgFrom(markup: string): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.querySelector('svg') as SVGSVGElement;
}

describe('naturalSvgSize', () => {
  it('reads the drawing size mermaid publishes in the viewBox', () => {
    const svg = svgFrom(
      '<svg width="100%" style="max-width: 851px" viewBox="0 0 3204.5 412"></svg>'
    );

    expect(naturalSvgSize(svg)).toEqual({ width: 3204.5, height: 412 });
  });

  it('falls back to explicit width and height attributes', () => {
    const svg = svgFrom('<svg width="640" height="480"></svg>');

    expect(naturalSvgSize(svg)).toEqual({ width: 640, height: 480 });
  });

  it('ignores a viewBox that carries no drawing area', () => {
    const svg = svgFrom(
      '<svg viewBox="0 0 0 0" width="320" height="200"></svg>'
    );

    expect(naturalSvgSize(svg)).toEqual({ width: 320, height: 200 });
  });

  it('reports an unmeasurable svg as zero-sized', () => {
    const svg = svgFrom('<svg width="100%"></svg>');

    expect(naturalSvgSize(svg)).toEqual({ width: 0, height: 0 });
  });
});
