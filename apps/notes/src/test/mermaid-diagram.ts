import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import { mermaidBlockHtml } from './hostile-markdown';

type Restore = () => void;

const DIAGRAM_SELECTOR = '.mermaid-preview-area svg';
const DIAGRAM_TIMEOUT_MS = 5_000;

const TEXT_WIDTH_PER_CHAR_PX = 8;
const BOX = { x: 0, y: 0, width: 40, height: 20 };

function overrideProperty(
  prototype: object,
  name: string,
  descriptor: PropertyDescriptor
): Restore {
  const original = Object.getOwnPropertyDescriptor(prototype, name);
  Object.defineProperty(prototype, name, { configurable: true, ...descriptor });
  return () => {
    if (original) {
      Object.defineProperty(prototype, name, original);
    } else {
      Reflect.deleteProperty(prototype, name);
    }
  };
}

/**
 * Gives jsdom the layout Mermaid needs to draw (text measurement, SVG boxes,
 * settled images), so a test can render a real diagram. Returns the restore.
 */
export function stubMermaidLayout(): Restore {
  const restores = [
    overrideProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        font: '',
        measureText: (text: string) => ({
          width: text.length * TEXT_WIDTH_PER_CHAR_PX,
        }),
      }),
    }),
    overrideProperty(SVGElement.prototype, 'getBBox', { value: () => BOX }),
    overrideProperty(SVGElement.prototype, 'getComputedTextLength', {
      value: () => BOX.width,
    }),
    overrideProperty(HTMLImageElement.prototype, 'decode', {
      value: () => Promise.resolve(),
    }),
    overrideProperty(HTMLImageElement.prototype, 'complete', {
      get: () => true,
    }),
  ];
  return () => {
    for (const restore of restores.toReversed()) {
      restore();
    }
  };
}

/**
 * Renders a mermaid block holding `source` through `renderSurface`, which
 * returns the region it rendered into, and waits until the diagram is drawn.
 */
export async function renderWithDiagram(
  renderSurface: (payload: string) => Promise<HTMLElement>,
  source: string
): Promise<HTMLElement> {
  const region = await renderSurface(mermaidBlockHtml(source));
  await waitFor(
    () => expect(region.querySelector(DIAGRAM_SELECTOR)).not.toBeNull(),
    { timeout: DIAGRAM_TIMEOUT_MS }
  );
  return region;
}
