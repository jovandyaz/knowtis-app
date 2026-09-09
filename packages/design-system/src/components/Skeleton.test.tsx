import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Skeleton ref={ref} data-testid="skeleton" />);
    expect(ref.current).toBe(screen.getByTestId('skeleton'));
  });
});
