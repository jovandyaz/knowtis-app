import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
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
});
