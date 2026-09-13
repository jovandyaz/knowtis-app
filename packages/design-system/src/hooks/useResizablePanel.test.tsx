import { act, renderHook } from '@testing-library/react';

import { reducedMotion } from '../test-utils/motion-react';
import { useResizablePanel } from './useResizablePanel';

vi.mock('motion/react', async () => {
  const { mockMotionReact } = await import('../test-utils/motion-react');
  return mockMotionReact();
});

function renderPanel() {
  return renderHook(
    ({ targetWidth }: { targetWidth?: number }) =>
      useResizablePanel({
        defaultWidth: 500,
        minWidth: 300,
        maxWidth: 960,
        collapseThreshold: 240,
        isOpen: true,
        onCollapse: () => undefined,
        targetWidth,
        side: 'right',
      }),
    { initialProps: {} as { targetWidth?: number } }
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
});
