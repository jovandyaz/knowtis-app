import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResizeHandle } from './ResizeHandle';

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
});
