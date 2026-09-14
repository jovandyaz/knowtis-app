import { act, renderHook } from '@testing-library/react';

import { reducedMotion } from '../test-utils/motion-react';
import { useResizablePanel } from './useResizablePanel';

vi.mock('motion/react', async () => {
  const { mockMotionReact } = await import('../test-utils/motion-react');
  return mockMotionReact();
});

interface PanelProps {
  isOpen?: boolean;
  targetWidth?: number;
  onCollapse?: () => void;
}

const noop = () => undefined;

function renderPanel(initialProps: PanelProps = {}) {
  return renderHook(
    ({ isOpen = true, targetWidth, onCollapse = noop }: PanelProps) =>
      useResizablePanel({
        defaultWidth: 500,
        minWidth: 300,
        maxWidth: 960,
        collapseThreshold: 240,
        isOpen,
        onCollapse,
        targetWidth,
        side: 'right',
      }),
    { initialProps }
  );
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
});
