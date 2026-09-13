import { createRef } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResizablePanel } from './ResizablePanel';

const PANEL_DEFAULT_WIDTH = 320;
const PANEL_MAX_WIDTH = 640;
const PANEL_COLLAPSE_THRESHOLD = 160;

describe('ResizablePanel', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(
      <ResizablePanel
        ref={ref}
        defaultWidth={PANEL_DEFAULT_WIDTH}
        maxWidth={PANEL_MAX_WIDTH}
        collapseThreshold={PANEL_COLLAPSE_THRESHOLD}
        isOpen
        onCollapse={vi.fn()}
        side="left"
      >
        <p>Panel body</p>
      </ResizablePanel>
    );
    expect(ref.current).toBe(screen.getByText('Panel body').closest('aside'));
  });

  it('animates to targetWidth and back to the previous width', async () => {
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      isOpen: true,
      onCollapse: vi.fn(),
      side: 'right' as const,
    };
    const { rerender } = render(
      <ResizablePanel {...base} maxWidth={PANEL_MAX_WIDTH}>
        <p>Body</p>
      </ResizablePanel>
    );
    const aside = screen.getByText('Body').closest('aside') as HTMLElement;
    expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`);

    rerender(
      <ResizablePanel {...base} maxWidth={900} targetWidth={700}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() => expect(aside.style.width).toBe('700px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '900'
    );

    rerender(
      <ResizablePanel {...base} maxWidth={PANEL_MAX_WIDTH}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() =>
      expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`)
    );
  });
});
