import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MermaidDiagramViewer } from './MermaidDiagramViewer';
import { ZOOM_STEP } from './usePanZoom';

const SVG = '<svg id="diagram" width="4000" height="400"></svg>';
const VIEWPORT = { width: 1000, height: 600 };
const FIT_SCALE = VIEWPORT.width / 4000;

// jsdom lays nothing out, so the surface reports its size the way a browser
// would — without it every fit collapses to the identity transform
class ViewportResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const entry = {
      target,
      contentRect: {
        ...VIEWPORT,
        top: 0,
        left: 0,
        right: VIEWPORT.width,
        bottom: VIEWPORT.height,
        x: 0,
        y: 0,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ViewportResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderViewer(open = true) {
  const onOpenChange = vi.fn();
  render(
    <MermaidDiagramViewer open={open} onOpenChange={onOpenChange} svg={SVG} />
  );
  return onOpenChange;
}

function canvas() {
  return screen.getByRole('dialog').querySelector('svg')
    ?.parentElement as HTMLElement;
}

function scaleOf(element: HTMLElement) {
  const match = /scale\(([\d.]+)\)/.exec(element.style.transform);
  return match ? Number(match[1]) : null;
}

describe('MermaidDiagramViewer', () => {
  it('shows the diagram while open', () => {
    renderViewer();

    expect(screen.getByRole('dialog').querySelector('svg')).not.toBeNull();
  });

  it('opens with the whole diagram fitted to the surface', () => {
    renderViewer();

    expect(scaleOf(canvas())).toBeCloseTo(FIT_SCALE);
  });

  it('renders nothing while closed', () => {
    renderViewer(false);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lays the diagram out at the size it was drawn at', () => {
    renderViewer();

    expect(canvas().style.width).toBe('4000px');
    expect(canvas().style.height).toBe('400px');
  });

  it('scales the diagram up when zooming in', async () => {
    const user = userEvent.setup();
    renderViewer();
    const before = scaleOf(canvas());

    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.zoomIn' })
    );

    expect(scaleOf(canvas())).toBeCloseTo((before ?? 1) * ZOOM_STEP);
  });

  it('scales the diagram down when zooming out', async () => {
    const user = userEvent.setup();
    renderViewer();
    const before = scaleOf(canvas());

    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.zoomOut' })
    );

    expect(scaleOf(canvas())).toBeCloseTo((before ?? 1) / ZOOM_STEP);
  });

  it('zooms on wheel over the diagram', () => {
    renderViewer();
    const before = scaleOf(canvas()) ?? 1;

    fireEvent.wheel(canvas().parentElement as HTMLElement, {
      deltaY: -100,
      clientX: 200,
      clientY: 200,
    });

    expect(scaleOf(canvas()) ?? 0).toBeGreaterThan(before);
  });

  it('pans the diagram while dragging', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;
    const before = canvas().style.transform;

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 160, clientY: 130 });
    fireEvent.pointerUp(surface, { clientX: 160, clientY: 130 });

    expect(canvas().style.transform).not.toBe(before);
  });

  it('does not start a pan when a zoom control is pressed', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;
    const capturePointer = vi.fn();
    surface.setPointerCapture = capturePointer;

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'editor.mermaid.zoomIn' }),
      { clientX: 500, clientY: 500, button: 0, pointerId: 1 }
    );

    expect(capturePointer).not.toHaveBeenCalled();
  });

  it('still pans when the browser refuses to capture the pointer', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;
    surface.setPointerCapture = () => {
      throw new DOMException('No active pointer', 'NotFoundError');
    };
    const before = canvas().style.transform;

    fireEvent.pointerDown(surface, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: 180,
      clientY: 140,
      pointerId: 1,
    });

    expect(canvas().style.transform).not.toBe(before);
  });

  it('zooms when two pointers spread apart', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;
    const before = scaleOf(canvas()) ?? 1;

    fireEvent.pointerDown(surface, {
      clientX: 150,
      clientY: 400,
      pointerId: 1,
    });
    fireEvent.pointerDown(surface, {
      clientX: 250,
      clientY: 400,
      pointerId: 2,
    });
    fireEvent.pointerMove(surface, {
      clientX: 120,
      clientY: 400,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: 280,
      clientY: 400,
      pointerId: 2,
    });
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(surface, {
      clientX: 340,
      clientY: 400,
      pointerId: 2,
    });

    expect(scaleOf(canvas()) ?? 0).toBeGreaterThan(before);
  });

  it('restores the fitted view after zooming', async () => {
    const user = userEvent.setup();
    renderViewer();
    const fitted = canvas().style.transform;

    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.zoomIn' })
    );
    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.fitToScreen' })
    );

    expect(canvas().style.transform).toBe(fitted);
  });

  it('reports the current zoom level', async () => {
    const user = userEvent.setup();
    renderViewer();
    expect(screen.getByText('25%')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.zoomIn' })
    );

    expect(
      screen.getByText(`${Math.round(FIT_SCALE * ZOOM_STEP * 100)}%`)
    ).toBeInTheDocument();
  });
});
