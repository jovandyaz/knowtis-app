import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';

import { act, fireEvent, renderHook } from '@testing-library/react';

import { reducedMotion } from '../test-utils/motion-react';
import {
  useResizablePanel,
  type PanelSide,
  type ResizablePanelState,
} from './useResizablePanel';

vi.mock('motion/react', async () => {
  const { mockMotionReact } = await import('../test-utils/motion-react');
  return mockMotionReact();
});

const DEFAULT_WIDTH = 500;
const MIN_WIDTH = 300;
const MAX_WIDTH = 960;
const COLLAPSE_THRESHOLD = 240;
const KEYBOARD_STEP = 8;

interface PanelProps {
  isOpen?: boolean;
  minWidth?: number;
  targetWidth?: number;
  onCollapse?: () => void;
  onResizeEnd?: (width: number) => void;
  side?: PanelSide;
}

const noop = () => undefined;

function renderPanel(initialProps: PanelProps = {}) {
  return renderHook(
    ({
      isOpen = true,
      minWidth = MIN_WIDTH,
      targetWidth,
      onCollapse = noop,
      onResizeEnd = noop,
      side = 'right',
    }: PanelProps) =>
      useResizablePanel({
        defaultWidth: DEFAULT_WIDTH,
        minWidth,
        maxWidth: MAX_WIDTH,
        collapseThreshold: COLLAPSE_THRESHOLD,
        isOpen,
        onCollapse,
        onResizeEnd,
        targetWidth,
        side,
      }),
    { initialProps }
  );
}

interface PanelResult {
  current: ResizablePanelState;
}

function expectAnnouncedRangeHolds({ current }: PanelResult) {
  const { handleProps } = current;
  expect(handleProps['aria-valuemin']).toBeLessThanOrEqual(
    handleProps['aria-valuenow']
  );
  expect(handleProps['aria-valuenow']).toBeLessThanOrEqual(
    handleProps['aria-valuemax']
  );
}

function pressKey(result: PanelResult, key: string) {
  const preventDefault = vi.fn();
  act(() => {
    result.current.handleProps.onKeyDown({
      key,
      preventDefault,
    } as unknown as ReactKeyboardEvent);
  });
  return preventDefault;
}

function startDrag(result: PanelResult) {
  act(() => {
    result.current.handleProps.onMouseDown({
      preventDefault: noop,
      clientX: 0,
    } as unknown as ReactMouseEvent);
  });
}

function dragTo(result: PanelResult, clientX: number) {
  startDrag(result);
  fireEvent.mouseMove(document, { clientX });
  fireEvent.mouseUp(document);
}

async function flushFrames() {
  await act(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

afterEach(() => {
  reducedMotion.value = false;
});

describe('useResizablePanel', () => {
  it('transitions to the target width', async () => {
    const { result, rerender } = renderPanel();

    rerender({ targetWidth: 960 });
    await flushFrames();

    expect(result.current.width).toBe(960);
    expect(result.current.transitionStyle).toBe('width 300ms ease');
  });

  it('reaches the target width without motion when the OS asks for none', async () => {
    reducedMotion.value = true;
    const { result, rerender } = renderPanel();

    rerender({ targetWidth: 960 });
    await flushFrames();

    expect(result.current.width).toBe(960);
    expect(result.current.transitionStyle).toBe('none');
  });

  it('restores a usable width when the panel opens and targets in one commit', async () => {
    const onCollapse = vi.fn();
    const { result, rerender } = renderPanel({ isOpen: false, onCollapse });
    expect(result.current.width).toBe(0);

    rerender({ isOpen: true, targetWidth: 700, onCollapse });
    await flushFrames();
    expect(result.current.width).toBe(700);

    rerender({ isOpen: true, onCollapse });
    await flushFrames();

    expect(result.current.width).toBe(500);
    expect(onCollapse).not.toHaveBeenCalled();
  });

  it('exposes the resize bounds through ARIA', () => {
    const { result } = renderPanel();

    expect(result.current.handleProps['aria-valuemin']).toBe(0);
    expect(result.current.handleProps['aria-valuemax']).toBe(MAX_WIDTH);
    expect(result.current.handleProps['aria-valuenow']).toBe(DEFAULT_WIDTH);
  });

  it('announces a value inside its range while a drag goes below the minimum', () => {
    const { result } = renderPanel();

    startDrag(result);
    fireEvent.mouseMove(document, { clientX: 400 });

    expect(result.current.width).toBe(DEFAULT_WIDTH - 400);
    expect(result.current.width).toBeLessThan(MIN_WIDTH);
    expectAnnouncedRangeHolds(result);

    fireEvent.mouseUp(document);
  });

  it('announces a value inside its range while the panel closes', async () => {
    const { result, rerender } = renderPanel();

    rerender({ isOpen: false });
    await flushFrames();

    expect(result.current.isVisible).toBe(true);
    expect(result.current.width).toBe(0);
    expectAnnouncedRangeHolds(result);
  });
});

describe('useResizablePanel keyboard resizing', () => {
  it('grows with ArrowLeft and shrinks with ArrowRight on a right-side panel', () => {
    const { result } = renderPanel();

    pressKey(result, 'ArrowLeft');
    expect(result.current.width).toBe(DEFAULT_WIDTH + KEYBOARD_STEP);

    pressKey(result, 'ArrowRight');
    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it('grows with ArrowRight and shrinks with ArrowLeft on a left-side panel', () => {
    const { result } = renderPanel({ side: 'left' });

    pressKey(result, 'ArrowRight');
    expect(result.current.width).toBe(DEFAULT_WIDTH + KEYBOARD_STEP);

    pressKey(result, 'ArrowLeft');
    expect(result.current.width).toBe(DEFAULT_WIDTH);
  });

  it('jumps to the bounds with Home and End', () => {
    const { result } = renderPanel();

    pressKey(result, 'End');
    expect(result.current.width).toBe(MAX_WIDTH);

    pressKey(result, 'Home');
    expect(result.current.width).toBe(MIN_WIDTH);
  });

  it('clamps stepping at both bounds', () => {
    const { result } = renderPanel();

    pressKey(result, 'End');
    pressKey(result, 'ArrowLeft');
    expect(result.current.width).toBe(MAX_WIDTH);

    pressKey(result, 'Home');
    pressKey(result, 'ArrowRight');
    expect(result.current.width).toBe(MIN_WIDTH);
  });

  it('prevents default only for the keys it handles', () => {
    const { result } = renderPanel();

    expect(pressKey(result, 'ArrowLeft')).toHaveBeenCalled();
    expect(pressKey(result, 'End')).toHaveBeenCalled();
    expect(pressKey(result, 'Tab')).not.toHaveBeenCalled();
    expect(result.current.width).toBe(MAX_WIDTH);
  });

  it('reports the settled width after every keyboard adjustment', () => {
    const onResizeEnd = vi.fn();
    const { result } = renderPanel({ onResizeEnd });

    pressKey(result, 'ArrowLeft');
    expect(onResizeEnd).toHaveBeenLastCalledWith(DEFAULT_WIDTH + KEYBOARD_STEP);

    pressKey(result, 'Home');
    expect(onResizeEnd).toHaveBeenLastCalledWith(MIN_WIDTH);
    expect(onResizeEnd).toHaveBeenCalledTimes(2);
  });

  it('still collapses on Enter without reporting a resize', () => {
    const onCollapse = vi.fn();
    const onResizeEnd = vi.fn();
    const { result } = renderPanel({ onCollapse, onResizeEnd });

    expect(pressKey(result, 'Enter')).toHaveBeenCalled();
    expect(result.current.width).toBe(0);
    expect(onResizeEnd).not.toHaveBeenCalled();
  });

  it('never lets the keyboard reach a collapsed width', () => {
    const onCollapse = vi.fn();
    const onResizeEnd = vi.fn();
    const { result } = renderPanel({ minWidth: 0, onCollapse, onResizeEnd });

    pressKey(result, 'Home');
    expect(result.current.width).toBe(1);

    pressKey(result, 'ArrowRight');
    expect(result.current.width).toBe(1);

    expect(result.current.isVisible).toBe(true);
    expect(onCollapse).not.toHaveBeenCalled();
    expect(onResizeEnd).toHaveBeenLastCalledWith(1);
  });

  it('ignores width keys while a target width is held', async () => {
    const onResizeEnd = vi.fn();
    const { result, rerender } = renderPanel({ onResizeEnd });

    rerender({ targetWidth: 700, onResizeEnd });
    await flushFrames();

    pressKey(result, 'ArrowLeft');

    expect(result.current.width).toBe(700);
    expect(onResizeEnd).not.toHaveBeenCalled();
  });

  it('still prevents default for handled keys while a target width is held', async () => {
    const { result, rerender } = renderPanel();

    rerender({ targetWidth: 700 });
    await flushFrames();

    expect(pressKey(result, 'ArrowLeft')).toHaveBeenCalled();
    expect(pressKey(result, 'Home')).toHaveBeenCalled();
    expect(pressKey(result, 'Tab')).not.toHaveBeenCalled();
    expect(result.current.width).toBe(700);
  });

  it('still prevents default for handled keys while dragging', () => {
    const { result } = renderPanel();

    startDrag(result);
    fireEvent.mouseMove(document, { clientX: -100 });

    expect(pressKey(result, 'End')).toHaveBeenCalled();
    expect(result.current.width).toBe(DEFAULT_WIDTH + 100);

    fireEvent.mouseUp(document);
  });

  it('ignores width keys while dragging', () => {
    const onResizeEnd = vi.fn();
    const { result } = renderPanel({ onResizeEnd });

    startDrag(result);
    fireEvent.mouseMove(document, { clientX: -100 });
    expect(result.current.width).toBe(DEFAULT_WIDTH + 100);

    pressKey(result, 'ArrowLeft');
    expect(result.current.width).toBe(DEFAULT_WIDTH + 100);

    fireEvent.mouseUp(document);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    expect(onResizeEnd).toHaveBeenCalledWith(DEFAULT_WIDTH + 100);
  });
});

describe('useResizablePanel onResizeEnd', () => {
  it('reports the snapped width once the drag is released', () => {
    const onResizeEnd = vi.fn();
    const { result } = renderPanel({ onResizeEnd });

    dragTo(result, 220);

    expect(result.current.width).toBe(MIN_WIDTH);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    expect(onResizeEnd).toHaveBeenCalledWith(MIN_WIDTH);
  });

  it('stays silent when the release collapses the panel', () => {
    const onCollapse = vi.fn();
    const onResizeEnd = vi.fn();
    const { result } = renderPanel({ onCollapse, onResizeEnd });

    dragTo(result, 320);

    expect(result.current.width).toBe(0);
    expect(onResizeEnd).not.toHaveBeenCalled();
  });

  it('stays silent when a drag ends while a target width is held', async () => {
    const onResizeEnd = vi.fn();
    const { result, rerender } = renderPanel({ onResizeEnd });

    rerender({ targetWidth: 700, onResizeEnd });
    await flushFrames();

    dragTo(result, -100);

    expect(onResizeEnd).not.toHaveBeenCalled();
  });

  it('stays silent for target width changes and open or close animations', async () => {
    const onResizeEnd = vi.fn();
    const { rerender } = renderPanel({ isOpen: false, onResizeEnd });

    rerender({ isOpen: true, onResizeEnd });
    await flushFrames();

    rerender({ isOpen: true, targetWidth: 700, onResizeEnd });
    await flushFrames();

    rerender({ isOpen: false, onResizeEnd });
    await flushFrames();

    expect(onResizeEnd).not.toHaveBeenCalled();
  });
});
