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

  it('asks to close when the reader presses Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderViewer();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
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

  it('keeps the centre of the view steady while zooming with the controls', async () => {
    const user = userEvent.setup();
    renderViewer();
    const centre = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    const worldUnderCentre = (element: HTMLElement) => {
      const scale = scaleOf(element) ?? 1;
      const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
        element.style.transform
      ) as unknown as [string, string, string];
      return {
        x: (centre.x - Number(x)) / scale,
        y: (centre.y - Number(y)) / scale,
      };
    };
    const before = worldUnderCentre(canvas());

    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.zoomIn' })
    );

    const after = worldUnderCentre(canvas());
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
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

  it('does not pan the diagram when a drag starts on a zoom control', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;
    const before = canvas().style.transform;

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'editor.mermaid.zoomOut' }),
      { clientX: 500, clientY: 500, button: 0, buttons: 1, pointerId: 1 }
    );
    fireEvent.pointerMove(surface, {
      clientX: 560,
      clientY: 540,
      buttons: 1,
      pointerId: 1,
    });

    expect(canvas().style.transform).toBe(before);
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

  it('ignores a drag started with a secondary button', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;
    const before = canvas().style.transform;

    fireEvent.pointerDown(surface, {
      clientX: 100,
      clientY: 100,
      button: 2,
      buttons: 2,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: 200,
      clientY: 160,
      buttons: 2,
      pointerId: 1,
    });

    expect(canvas().style.transform).toBe(before);
  });

  it('stops panning once the mouse button is no longer held', () => {
    renderViewer();
    const surface = canvas().parentElement as HTMLElement;

    fireEvent.pointerDown(surface, {
      clientX: 100,
      clientY: 100,
      button: 0,
      buttons: 1,
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: 150,
      clientY: 130,
      buttons: 1,
      pointerId: 1,
    });
    const afterDrag = canvas().style.transform;

    fireEvent.pointerMove(surface, {
      clientX: 400,
      clientY: 400,
      buttons: 0,
      pointerType: 'mouse',
      pointerId: 1,
    });
    fireEvent.pointerMove(surface, {
      clientX: 600,
      clientY: 500,
      buttons: 0,
      pointerType: 'mouse',
      pointerId: 1,
    });

    expect(canvas().style.transform).toBe(afterDrag);
  });

  it('pans with the arrow keys for readers without a pointer', async () => {
    const user = userEvent.setup();
    renderViewer();
    const before = canvas().style.transform;

    await user.click(screen.getByRole('application'));
    await user.keyboard('{ArrowRight}');

    expect(canvas().style.transform).not.toBe(before);
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
