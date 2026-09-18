import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PanelSide } from '../hooks/useResizablePanel';
import { ResizeHandle } from './ResizeHandle';

function renderHandle(props: { isDragging?: boolean; side: PanelSide }) {
  const { isDragging = false, side } = props;
  render(
    <ResizeHandle
      isDragging={isDragging}
      side={side}
      role="separator"
      aria-label="Resize"
    />
  );
  return screen.getByRole('separator');
}

describe('ResizeHandle', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ResizeHandle
        ref={ref}
        isDragging={false}
        side="right"
        role="separator"
        aria-label="Resize"
      />
    );
    expect(ref.current).toBe(screen.getByRole('separator'));
  });

  it('renders a transparent grab area with a hairline rule', () => {
    const handle = renderHandle({ side: 'right' });

    expect(handle).toHaveClass(
      'absolute',
      'top-0',
      'bottom-0',
      'w-2',
      'cursor-col-resize',
      'outline-none',
      'bg-transparent',
      'after:absolute',
      'after:inset-y-0',
      'after:w-px',
      "after:content-['']",
      'after:transition-colors',
      'after:duration-(--motion-duration-fast)',
      'after:ease-standard',
      'motion-reduce:after:transition-none'
    );
  });

  it('anchors the grab area and the rule to the left edge', () => {
    const handle = renderHandle({ side: 'left' });

    expect(handle).toHaveClass('left-0', 'after:left-0');
    expect(handle).not.toHaveClass('right-0');
    expect(handle).not.toHaveClass('after:right-0');
    expect(handle).not.toHaveClass('-ml-px');
  });

  it('anchors the grab area and the rule to the right edge', () => {
    const handle = renderHandle({ side: 'right' });

    expect(handle).toHaveClass('right-0', 'after:right-0');
    expect(handle).not.toHaveClass('left-0');
    expect(handle).not.toHaveClass('after:left-0');
    expect(handle).not.toHaveClass('-mr-px');
  });

  it('rests as the panel divider and tints on hover and focus', () => {
    const handle = renderHandle({ side: 'right' });

    expect(handle).toHaveClass(
      'after:bg-border',
      'hover:after:bg-primary/40',
      'focus-visible:after:bg-primary',
      'focus-visible:after:w-0.5'
    );
    expect(handle).not.toHaveClass('after:bg-primary');
    expect(handle).not.toHaveClass('after:bg-transparent');
  });

  it('paints the rule while dragging', () => {
    const handle = renderHandle({ side: 'right', isDragging: true });

    expect(handle).toHaveClass('after:bg-primary');
    expect(handle).not.toHaveClass('after:bg-border');
    expect(handle).not.toHaveClass('hover:after:bg-primary/40');
  });
});
